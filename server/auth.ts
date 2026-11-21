import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export type SupportedLanguage = 'en' | 'kn' | 'hi';

export function isSupportedLanguage(val: unknown): val is SupportedLanguage {
  return val === 'en' || val === 'kn' || val === 'hi';
}

export function normalizeLanguage(val: unknown): SupportedLanguage {
  return isSupportedLanguage(val) ? val : 'en';
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  age: number | null;
  avatarUrl: string | null;
  preferences: string;
  theme: 'light' | 'dark';
  language: SupportedLanguage;
  notificationsEnabled: boolean;
  privacySaveReports: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedRequest extends Request {
  user?: PublicUser;
}

const SESSION_COOKIE_NAME = 'mg_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  const secretFile = path.resolve(process.cwd(), '.mediguide_secret');
  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  } catch {
    // Ignore write failure in read-only environments; keep in-memory secret
  }
  return generated;
}

const SESSION_SECRET = getSessionSecret();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function createSessionToken(userId: string): string {
  const payload = {
    uid: userId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
      uid?: string;
      exp?: number;
    };
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload.uid;
  } catch {
    return null;
  }
}

function isHttpsRequest(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === 'production';
  const forwardedProto = req.headers['x-forwarded-proto'];
  return req.secure || forwardedProto === 'https';
}

export function setSessionCookie(res: Response, userId: string, req?: Request): string {
  const token = createSessionToken(userId);
  const isHttps = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  return token;
}

export function clearSessionCookie(res: Response, req?: Request): void {
  const isHttps = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
  });
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  age: number | null;
  avatar_url: string | null;
  preferences: string | null;
  theme: string;
  language?: string | null;
  notifications_enabled: number;
  privacy_save_reports: number;
  created_at: string;
  updated_at: string;
}

export function mapUserRow(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    age: row.age ?? null,
    avatarUrl: row.avatar_url ?? null,
    preferences: row.preferences ?? '',
    theme: row.theme === 'dark' ? 'dark' : 'light',
    language: normalizeLanguage(row.language),
    notificationsEnabled: row.notifications_enabled === 1,
    privacySaveReports: row.privacy_save_reports === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getUserById(userId: string): PublicUser | null {
  const row = db
    .prepare(
      `SELECT id, name, email, age, avatar_url, preferences, theme, language, notifications_enabled, privacy_save_reports, created_at, updated_at
       FROM users WHERE id = ?`
    )
    .get(userId) as UserRow | undefined;
  return row ? mapUserRow(row) : null;
}

function extractRequestToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken) {
    return cookieToken;
  }
  return null;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractRequestToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }
  const userId = verifySessionToken(token);
  if (!userId) {
    clearSessionCookie(res, req);
    res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    return;
  }
  const user = getUserById(userId);
  if (!user) {
    clearSessionCookie(res, req);
    res.status(401).json({ error: 'User account not found.' });
    return;
  }
  req.user = user;
  next();
}
