import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import {
  clearSessionCookie,
  getUserById,
  hashPassword,
  isSupportedLanguage,
  mapUserRow,
  normalizeLanguage,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from './server/auth.ts';
import type { AuthenticatedRequest, SupportedLanguage } from './server/auth.ts';
import { createNotification, db, logActivity } from './server/db.ts';
import {
  analyzeSymptoms,
  askHealthAssistant,
  explainMedicalReport,
  formatGeminiError,
  generatePreventiveTips,
  searchMedicineInfo,
} from './server/gemini.ts';
import {
  getLocalizedReportNotification,
  getLocalizedWelcomeNotification,
  getServerMessages,
} from './server/i18nErrors.ts';

const app = express();
app.set('trust proxy', 1);

function getCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const eqPrefix = `${flag}=`;
  const eqArg = process.argv.find((a) => a.startsWith(eqPrefix));
  return eqArg ? eqArg.slice(eqPrefix.length) : undefined;
}

const PORT = Number(getCliArg('--port') || process.env.PORT) || 3000;
const HOST = getCliArg('--host') || process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

const ALLOWED_RECORD_CATEGORIES = new Set([
  'General health information',
  'Medical reports',
  'Doctor visits',
  'Allergies',
  'Vaccination records',
  'Other health documents',
]);

const ALLOWED_REPORT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolvePublicLanguage(req: express.Request): SupportedLanguage {
  const bodyLang = (req.body as { language?: unknown } | undefined)?.language;
  if (isSupportedLanguage(bodyLang)) {
    return bodyLang;
  }
  const headerLang = req.headers['x-mediguide-language'];
  const normalizedHeader = Array.isArray(headerLang) ? headerLang[0] : headerLang;
  if (isSupportedLanguage(normalizedHeader)) {
    return normalizedHeader;
  }
  return 'en';
}

function resolveRequestLanguage(req: AuthenticatedRequest): SupportedLanguage {
  const bodyLang = (req.body as { language?: unknown } | undefined)?.language;
  if (isSupportedLanguage(bodyLang)) {
    return bodyLang;
  }
  const headerLang = req.headers['x-mediguide-language'];
  const normalizedHeader = Array.isArray(headerLang) ? headerLang[0] : headerLang;
  if (isSupportedLanguage(normalizedHeader)) {
    return normalizedHeader;
  }
  return normalizeLanguage(req.user?.language);
}

// ---------------- PUBLIC ENDPOINTS ----------------

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ),
    databaseEngine: 'SQLite (Local Persistent Storage)',
    firebaseConfigured: false,
  });
});

app.get('/api/public/stats', (_req, res) => {
  const usersCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const recordsCount = (db.prepare('SELECT COUNT(*) as c FROM health_records').get() as { c: number }).c;
  const reportsCount = (db.prepare('SELECT COUNT(*) as c FROM report_analyses').get() as { c: number }).c;
  const tipsCount = (db.prepare('SELECT COUNT(*) as c FROM saved_tips').get() as { c: number }).c;

  res.json({
    registeredUsers: usersCount,
    savedRecords: recordsCount,
    analyzedReports: reportsCount,
    savedWellnessTips: tipsCount,
    aiModules: 5,
  });
});

app.post('/api/contact', (req, res) => {
  const lang = resolvePublicLanguage(req);
  const m = getServerMessages(lang);
  const { name, email, subject, message } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    name.trim().length < 2 ||
    typeof email !== 'string' ||
    !isValidEmail(email.trim()) ||
    typeof subject !== 'string' ||
    subject.trim().length < 3 ||
    typeof message !== 'string' ||
    message.trim().length < 10
  ) {
    res.status(400).json({ error: m.contactInvalid });
    return;
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO contact_messages (id, name, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name.trim(), email.trim().toLowerCase(), subject.trim(), message.trim(), createdAt);

  res.status(201).json({
    id,
    message: m.contactSaved,
  });
});

// ---------------- AUTHENTICATION ROUTES ----------------

app.post('/api/auth/register', (req, res) => {
  const lang = resolvePublicLanguage(req);
  const m = getServerMessages(lang);
  const { name, email, password, age, language } = req.body ?? {};
  const regLanguage: SupportedLanguage = isSupportedLanguage(language) ? language : lang;

  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    res.status(400).json({ error: m.registerName });
    return;
  }
  if (typeof email !== 'string' || !isValidEmail(email.trim())) {
    res.status(400).json({ error: m.registerEmail });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: m.registerPassword });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: m.registerEmailExists });
    return;
  }

  const parsedAge =
    age !== undefined && age !== null && age !== '' ? Number(age) : null;
  if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120)) {
    res.status(400).json({ error: m.registerAge });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, age, avatar_url, preferences, theme, language, notifications_enabled, privacy_save_reports, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, '', 'light', ?, 1, 0, ?, ?)`
  ).run(id, name.trim(), normalizedEmail, passwordHash, parsedAge, regLanguage, now, now);

  logActivity(id, 'account', 'Created MediGuide AI personal account');
  const welcomeNotif = getLocalizedWelcomeNotification(regLanguage);
  createNotification(id, welcomeNotif.title, welcomeNotif.message);

  const token = setSessionCookie(res, id, req);
  const user = getUserById(id);
  res.status(201).json({ user, token });
});

app.post('/api/auth/login', (req, res) => {
  const m = getServerMessages(resolvePublicLanguage(req));
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !isValidEmail(email.trim()) || typeof password !== 'string') {
    res.status(400).json({ error: m.loginInvalidInput });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const row = db
    .prepare(
      `SELECT id, name, email, password_hash, age, avatar_url, preferences, theme, language, notifications_enabled, privacy_save_reports, created_at, updated_at
       FROM users WHERE email = ?`
    )
    .get(normalizedEmail) as
    | ({ password_hash: string } & Parameters<typeof mapUserRow>[0])
    | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: m.loginInvalidCredentials });
    return;
  }

  const token = setSessionCookie(res, row.id, req);
  logActivity(row.id, 'auth', 'Signed in to MediGuide AI');
  res.json({ user: mapUserRow(row), token });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const m = getServerMessages(resolvePublicLanguage(req));
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || !isValidEmail(email.trim())) {
    res.status(400).json({ error: m.forgotEmail });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(normalizedEmail) as { id: string } | undefined;

  if (!user) {
    res.status(404).json({ error: m.forgotNotFound });
    return;
  }

  const resetCode = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  db.prepare(
    'INSERT INTO password_resets (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)'
  ).run(resetCode, user.id, expiresAt);

  res.json({
    message: m.forgotSuccess,
    verificationCode: resetCode,
    expiresAt,
  });
});

app.post('/api/auth/reset-password', (req, res) => {
  const m = getServerMessages(resolvePublicLanguage(req));
  const { email, code, newPassword } = req.body ?? {};
  if (
    typeof email !== 'string' ||
    !isValidEmail(email.trim()) ||
    typeof code !== 'string' ||
    code.trim().length !== 6 ||
    typeof newPassword !== 'string' ||
    newPassword.length < 8
  ) {
    res.status(400).json({ error: m.resetInvalidInput });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(normalizedEmail) as { id: string } | undefined;
  if (!user) {
    res.status(400).json({ error: m.resetInvalidEmailOrCode });
    return;
  }

  const resetRow = db
    .prepare(
      'SELECT token, expires_at, used FROM password_resets WHERE user_id = ? AND token = ?'
    )
    .get(user.id, code.trim()) as { token: string; expires_at: string; used: number } | undefined;

  if (!resetRow || resetRow.used === 1 || new Date(resetRow.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: m.resetCodeExpired });
    return;
  }

  const newHash = hashPassword(newPassword);
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    newHash,
    now,
    user.id
  );
  db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(resetRow.token);
  logActivity(user.id, 'security', 'Reset account password');

  res.json({ message: m.resetSuccess });
});

// ---------------- PROFILE & SETTINGS ----------------

app.put('/api/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lang = resolveRequestLanguage(req);
  const m = getServerMessages(lang);
  const { name, age, avatarUrl, preferences, theme, language, notificationsEnabled, privacySaveReports } =
    req.body ?? {};

  const updates: string[] = [];
  const params: Array<string | number | null> = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      res.status(400).json({ error: m.profileName });
      return;
    }
    updates.push('name = ?');
    params.push(name.trim());
  }

  if (age !== undefined) {
    if (age === null || age === '') {
      updates.push('age = ?');
      params.push(null);
    } else {
      const parsedAge = Number(age);
      if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
        res.status(400).json({ error: m.profileAge });
        return;
      }
      updates.push('age = ?');
      params.push(parsedAge);
    }
  }

  if (avatarUrl !== undefined) {
    if (avatarUrl === null || avatarUrl === '') {
      updates.push('avatar_url = ?');
      params.push(null);
    } else if (typeof avatarUrl === 'string' && avatarUrl.length <= 200000) {
      updates.push('avatar_url = ?');
      params.push(avatarUrl);
    } else {
      res.status(400).json({ error: m.profileAvatar });
      return;
    }
  }

  if (preferences !== undefined) {
    if (typeof preferences !== 'string' || preferences.length > 500) {
      res.status(400).json({ error: m.profilePreferences });
      return;
    }
    updates.push('preferences = ?');
    params.push(preferences.trim());
  }

  if (theme !== undefined) {
    if (theme !== 'light' && theme !== 'dark') {
      res.status(400).json({ error: m.profileTheme });
      return;
    }
    updates.push('theme = ?');
    params.push(theme);
  }

  if (language !== undefined) {
    if (!isSupportedLanguage(language)) {
      res.status(400).json({ error: m.profileLanguage });
      return;
    }
    updates.push('language = ?');
    params.push(language);
  }

  if (notificationsEnabled !== undefined) {
    updates.push('notifications_enabled = ?');
    params.push(notificationsEnabled ? 1 : 0);
  }

  if (privacySaveReports !== undefined) {
    updates.push('privacy_save_reports = ?');
    params.push(privacySaveReports ? 1 : 0);
  }

  if (updates.length === 0) {
    res.json({ user: req.user });
    return;
  }

  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  params.push(now, userId);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  logActivity(userId, 'profile', 'Updated profile or preferences');
  res.json({ user: getUserById(userId) });
});

app.post('/api/profile/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const { currentPassword, newPassword } = req.body ?? {};
  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    newPassword.length < 8
  ) {
    res.status(400).json({ error: m.changePasswordInvalidInput });
    return;
  }

  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(userId) as { password_hash: string } | undefined;

  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    res.status(401).json({ error: m.changePasswordWrongCurrent });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hashPassword(newPassword),
    now,
    userId
  );
  logActivity(userId, 'security', 'Changed account password');
  res.json({ message: m.changePasswordSuccess });
});

app.delete('/api/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ error: m.deletePasswordRequired });
    return;
  }

  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(userId) as { password_hash: string } | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ error: m.deleteWrongPassword });
    return;
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

// ---------------- DASHBOARD & NOTIFICATIONS ----------------

app.get('/api/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const totalRecords = (
    db.prepare('SELECT COUNT(*) as c FROM health_records WHERE user_id = ?').get(userId) as {
      c: number;
    }
  ).c;
  const totalReports = (
    db.prepare('SELECT COUNT(*) as c FROM report_analyses WHERE user_id = ?').get(userId) as {
      c: number;
    }
  ).c;
  const totalConversations = (
    db.prepare('SELECT COUNT(*) as c FROM conversations WHERE user_id = ?').get(userId) as {
      c: number;
    }
  ).c;
  const totalSavedTips = (
    db.prepare('SELECT COUNT(*) as c FROM saved_tips WHERE user_id = ?').get(userId) as {
      c: number;
    }
  ).c;

  const recordsByCategory = db
    .prepare(
      'SELECT category, COUNT(*) as count FROM health_records WHERE user_id = ? GROUP BY category ORDER BY count DESC'
    )
    .all(userId) as Array<{ category: string; count: number }>;

  const activityByDay = db
    .prepare(
      `SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
       FROM activities
       WHERE user_id = ?
       GROUP BY substr(created_at, 1, 10)
       ORDER BY date DESC
       LIMIT 14`
    )
    .all(userId) as Array<{ date: string; count: number }>;

  const recentReports = db
    .prepare(
      `SELECT id, file_name as fileName, summary, created_at as createdAt
       FROM report_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 4`
    )
    .all(userId);

  const recentConversations = db
    .prepare(
      `SELECT c.id, c.title, c.updated_at as updatedAt,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as messageCount
       FROM conversations c
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC
       LIMIT 4`
    )
    .all(userId);

  const recentActivities = db
    .prepare(
      `SELECT id, action_type as actionType, description, created_at as createdAt
       FROM activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 8`
    )
    .all(userId);

  res.json({
    counts: {
      totalRecords,
      totalReports,
      totalConversations,
      totalSavedTips,
    },
    recordsByCategory,
    activityByDay: activityByDay.reverse(),
    recentReports,
    recentConversations,
    recentActivities,
  });
});

app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (!user.notificationsEnabled) {
    res.json({
      notifications: [],
      unreadCount: 0,
      notificationsEnabled: false,
    });
    return;
  }

  const items = db
    .prepare(
      `SELECT id, title, message, is_read as isRead, created_at as createdAt
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(user.id) as Array<{
    id: string;
    title: string;
    message: string;
    isRead: number;
    createdAt: string;
  }>;

  const unreadRow = db
    .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(user.id) as { count: number } | undefined;

  res.json({
    notifications: items.map((n) => ({ ...n, isRead: n.isRead === 1 })),
    unreadCount: unreadRow?.count ?? 0,
    notificationsEnabled: true,
  });
});

app.post('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const notifId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!notifId) {
    res.status(400).json({ error: m.notifInvalidId });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?')
    .get(notifId, userId) as { id: string } | undefined;

  if (!existing) {
    res.status(404).json({ error: m.notifNotFound });
    return;
  }

  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
    notifId,
    userId
  );
  res.json({ ok: true, id: notifId });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

app.get('/api/search', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    res.json({ records: [], conversations: [], tips: [] });
    return;
  }
  const like = `%${q}%`;

  const records = db
    .prepare(
      `SELECT id, title, category, record_date as recordDate
       FROM health_records
       WHERE user_id = ? AND (title LIKE ? OR notes LIKE ? OR category LIKE ?)
       ORDER BY record_date DESC LIMIT 5`
    )
    .all(userId, like, like, like);

  const conversations = db
    .prepare(
      `SELECT id, title, updated_at as updatedAt
       FROM conversations
       WHERE user_id = ? AND title LIKE ?
       ORDER BY updated_at DESC LIMIT 5`
    )
    .all(userId, like);

  const tips = db
    .prepare(
      `SELECT id, title, category, created_at as createdAt
       FROM saved_tips
       WHERE user_id = ? AND (title LIKE ? OR content LIKE ? OR category LIKE ?)
       ORDER BY created_at DESC LIMIT 5`
    )
    .all(userId, like, like, like);

  res.json({ records, conversations, tips });
});

// ---------------- AI HEALTH ASSISTANT ----------------

app.get('/api/assistant/conversations', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = db
    .prepare(
      `SELECT id, title, created_at as createdAt, updated_at as updatedAt
       FROM conversations WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(userId);
  res.json({ conversations: rows });
});

app.get('/api/assistant/conversations/:id/messages', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const convo = db
    .prepare('SELECT id, title FROM conversations WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as { id: string; title: string } | undefined;

  if (!convo) {
    res.status(404).json({ error: m.assistantConvoNotFound });
    return;
  }

  const messages = db
    .prepare(
      `SELECT id, role, content, created_at as createdAt
       FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC`
    )
    .all(convo.id, userId);

  res.json({ conversation: convo, messages });
});

app.post('/api/assistant/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lang = resolveRequestLanguage(req);
  const m = getServerMessages(lang);
  const { conversationId, message } = req.body ?? {};

  if (typeof message !== 'string' || message.trim().length < 2 || message.trim().length > 2000) {
    res.status(400).json({ error: m.assistantInvalidMsg });
    return;
  }

  const trimmed = message.trim();
  let activeConvoId = typeof conversationId === 'string' && conversationId ? conversationId : '';
  let history: Array<{ role: 'user' | 'model'; text: string }> = [];

  if (activeConvoId) {
    const convo = db
      .prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
      .get(activeConvoId, userId) as { id: string } | undefined;
    if (!convo) {
      res.status(404).json({ error: m.assistantConvoNotFound });
      return;
    }
    const prevRows = db
      .prepare(
        'SELECT role, content FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC'
      )
      .all(activeConvoId, userId) as Array<{ role: 'user' | 'model'; content: string }>;
    history = prevRows.map((r) => ({ role: r.role, text: r.content }));
  }

  try {
    const replyText = await askHealthAssistant(history, trimmed, lang);
    const now = new Date().toISOString();

    if (!activeConvoId) {
      activeConvoId = crypto.randomUUID();
      const title = trimmed.length > 56 ? `${trimmed.slice(0, 56)}...` : trimmed;
      db.prepare(
        'INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(activeConvoId, userId, title, now, now);
      logActivity(userId, 'assistant', `Started AI consultation: "${title}"`);
    } else {
      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?').run(
        now,
        activeConvoId,
        userId
      );
    }

    const userMsgId = crypto.randomUUID();
    const modelMsgId = crypto.randomUUID();
    const replyTime = new Date(Date.now() + 1).toISOString();

    db.prepare(
      'INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userMsgId, activeConvoId, userId, 'user', trimmed, now);

    db.prepare(
      'INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(modelMsgId, activeConvoId, userId, 'model', replyText, replyTime);

    res.json({
      conversationId: activeConvoId,
      userMessage: { id: userMsgId, role: 'user', content: trimmed, createdAt: now },
      assistantMessage: { id: modelMsgId, role: 'model', content: replyText, createdAt: replyTime },
    });
  } catch (err) {
    const formatted = formatGeminiError(err, lang);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.delete('/api/assistant/conversations/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const info = db
    .prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);

  if (info.changes === 0) {
    res.status(404).json({ error: m.assistantConvoNotFound });
    return;
  }
  logActivity(userId, 'assistant', 'Deleted an AI health conversation');
  res.json({ ok: true });
});

app.delete('/api/assistant/conversations', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  db.prepare('DELETE FROM conversations WHERE user_id = ?').run(userId);
  logActivity(userId, 'assistant', 'Cleared all AI health conversation history');
  res.json({ ok: true });
});

// ---------------- AI SYMPTOM INFORMATION ----------------

app.post('/api/symptoms/analyze', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lang = resolveRequestLanguage(req);
  const m = getServerMessages(lang);
  const { symptoms, duration, severity, additionalInfo } = req.body ?? {};

  if (
    typeof symptoms !== 'string' ||
    symptoms.trim().length < 3 ||
    typeof duration !== 'string' ||
    duration.trim().length < 1 ||
    typeof severity !== 'string' ||
    !['Mild', 'Moderate', 'Severe'].includes(severity)
  ) {
    res.status(400).json({ error: m.symptomsInvalidInput });
    return;
  }

  try {
    const result = await analyzeSymptoms({
      symptoms: symptoms.trim(),
      duration: duration.trim(),
      severity,
      additionalInfo: typeof additionalInfo === 'string' ? additionalInfo.trim() : '',
      language: lang,
    });
    logActivity(userId, 'symptoms', `Explored symptom information (${severity} severity)`);
    res.json({ analysis: result });
  } catch (err) {
    const formatted = formatGeminiError(err, lang);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// ---------------- AI MEDICAL REPORT EXPLAINER ----------------

function safeParseJsonArray(rawJson: string | null | undefined): unknown[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

app.get('/api/reports', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = db
    .prepare(
      `SELECT id, file_name as fileName, summary, extracted_tests_json as extractedTestsJson,
              questions_for_doctor_json as questionsForDoctorJson, created_at as createdAt
       FROM report_analyses WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(userId) as Array<{
    id: string;
    fileName: string;
    summary: string;
    extractedTestsJson: string;
    questionsForDoctorJson: string;
    createdAt: string;
  }>;

  res.json({
    reports: rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      summary: r.summary,
      tests: safeParseJsonArray(r.extractedTestsJson),
      questionsForDoctor: safeParseJsonArray(r.questionsForDoctorJson),
      createdAt: r.createdAt,
    })),
  });
});

app.post('/api/reports', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lang = resolveRequestLanguage(req);
  const m = getServerMessages(lang);
  const { fileName, summary, tests, questionsForDoctor } = req.body ?? {};

  const trimmedFileName = typeof fileName === 'string' ? fileName.trim() : '';
  const trimmedSummary = typeof summary === 'string' ? summary.trim() : '';

  if (!trimmedFileName || trimmedFileName.length > 200) {
    res.status(400).json({ error: m.reportName });
    return;
  }
  if (!trimmedSummary || trimmedSummary.length > 10000) {
    res.status(400).json({ error: m.reportSummaryRequired });
    return;
  }

  const normalizedTests = Array.isArray(tests) ? tests.slice(0, 100) : [];
  const normalizedQuestions = Array.isArray(questionsForDoctor)
    ? questionsForDoctor
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim())
        .slice(0, 20)
    : [];

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO report_analyses (id, user_id, file_name, summary, extracted_tests_json, questions_for_doctor_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    trimmedFileName,
    trimmedSummary,
    JSON.stringify(normalizedTests),
    JSON.stringify(normalizedQuestions),
    createdAt
  );

  const savedNotif = getLocalizedReportNotification('saved', lang);
  createNotification(userId, savedNotif.title, savedNotif.message);
  logActivity(userId, 'report', `Saved medical report summary for "${trimmedFileName}"`);

  res.status(201).json({
    report: {
      id,
      fileName: trimmedFileName,
      summary: trimmedSummary,
      tests: normalizedTests,
      questionsForDoctor: normalizedQuestions,
      createdAt,
    },
  });
});

app.put('/api/reports/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lang = resolveRequestLanguage(req);
  const m = getServerMessages(lang);
  const reportId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const { fileName, summary, tests, questionsForDoctor } = req.body ?? {};

  if (!reportId) {
    res.status(400).json({ error: m.reportInvalidId });
    return;
  }

  const existing = db
    .prepare(
      `SELECT id, file_name as fileName, summary, extracted_tests_json as extractedTestsJson,
              questions_for_doctor_json as questionsForDoctorJson, created_at as createdAt
       FROM report_analyses WHERE id = ? AND user_id = ?`
    )
    .get(reportId, userId) as
    | {
        id: string;
        fileName: string;
        summary: string;
        extractedTestsJson: string;
        questionsForDoctorJson: string;
        createdAt: string;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: m.reportNotFound });
    return;
  }

  const nextFileName =
    fileName !== undefined
      ? typeof fileName === 'string'
        ? fileName.trim()
        : ''
      : existing.fileName;
  const nextSummary =
    summary !== undefined ? (typeof summary === 'string' ? summary.trim() : '') : existing.summary;

  if (!nextFileName || nextFileName.length > 200) {
    res.status(400).json({ error: m.reportName });
    return;
  }
  if (!nextSummary || nextSummary.length > 10000) {
    res.status(400).json({ error: m.reportSummaryCannotBeEmpty });
    return;
  }

  const nextTests = Array.isArray(tests)
    ? tests.slice(0, 100)
    : safeParseJsonArray(existing.extractedTestsJson);
  const nextQuestions = Array.isArray(questionsForDoctor)
    ? questionsForDoctor
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim())
        .slice(0, 20)
    : safeParseJsonArray(existing.questionsForDoctorJson);

  const info = db
    .prepare(
      `UPDATE report_analyses
       SET file_name = ?, summary = ?, extracted_tests_json = ?, questions_for_doctor_json = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      nextFileName,
      nextSummary,
      JSON.stringify(nextTests),
      JSON.stringify(nextQuestions),
      reportId,
      userId
    );

  if (info.changes === 0) {
    res.status(404).json({ error: m.reportNotFound });
    return;
  }

  const updatedNotif = getLocalizedReportNotification('updated', lang);
  createNotification(userId, updatedNotif.title, updatedNotif.message);
  logActivity(userId, 'report', `Updated saved medical report summary "${nextFileName}"`);

  res.json({
    report: {
      id: existing.id,
      fileName: nextFileName,
      summary: nextSummary,
      tests: nextTests,
      questionsForDoctor: nextQuestions,
      createdAt: existing.createdAt,
    },
  });
});

function resolveAllowedReportMimeType(fileName: string, rawMimeType: unknown): string | null {
  const mime = typeof rawMimeType === 'string' ? rawMimeType.trim().toLowerCase() : '';
  if (mime === 'application/pdf' || mime === 'application/x-pdf') {
    return 'application/pdf';
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return 'image/jpeg';
  }
  if (mime === 'image/png') {
    return 'image/png';
  }
  if (!mime || mime === 'application/octet-stream') {
    const lower = fileName.trim().toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
  }
  return null;
}

app.post('/api/reports/explain', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lang = resolveRequestLanguage(req);
  const m = getServerMessages(lang);
  const { fileName, mimeType, base64Data, consentGiven, saveSummary } = req.body ?? {};

  if (consentGiven !== true) {
    res.status(400).json({ error: m.reportConsentRequired });
    return;
  }

  const normalizedFileName = typeof fileName === 'string' ? fileName.trim() : '';
  const resolvedMimeType = resolveAllowedReportMimeType(normalizedFileName, mimeType);
  const cleanedBase64 =
    typeof base64Data === 'string'
      ? base64Data.replace(/^data:[^;]+;base64,/i, '').trim()
      : '';

  if (
    !normalizedFileName ||
    !resolvedMimeType ||
    !ALLOWED_REPORT_MIME_TYPES.has(resolvedMimeType) ||
    cleanedBase64.length === 0
  ) {
    res.status(400).json({ error: m.reportInvalidFile });
    return;
  }

  // Approx 10MB decoded file size check
  const approxBytes = Math.ceil((cleanedBase64.length * 3) / 4);
  if (approxBytes > 10 * 1024 * 1024) {
    res.status(400).json({ error: m.reportFileTooLarge });
    return;
  }

  try {
    const explanation = await explainMedicalReport({
      base64Data: cleanedBase64,
      mimeType: resolvedMimeType,
      fileName: normalizedFileName,
      language: lang,
    });

    let savedId: string | null = null;
    if (saveSummary === true) {
      savedId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO report_analyses (id, user_id, file_name, summary, extracted_tests_json, questions_for_doctor_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        savedId,
        userId,
        normalizedFileName,
        explanation.summary,
        JSON.stringify(explanation.tests),
        JSON.stringify(explanation.questionsForDoctor),
        createdAt
      );
      const savedNotif = getLocalizedReportNotification('saved', lang);
      createNotification(userId, savedNotif.title, savedNotif.message);
    }

    logActivity(
      userId,
      'report',
      `Analyzed medical report "${normalizedFileName}" (raw file discarded from memory)`
    );

    res.json({ explanation, savedId, discardedOriginalFile: true });
  } catch (err) {
    const formatted = formatGeminiError(err, lang);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.delete('/api/reports/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const info = db
    .prepare('DELETE FROM report_analyses WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);

  if (info.changes === 0) {
    res.status(404).json({ error: m.reportNotFound });
    return;
  }
  logActivity(userId, 'report', 'Deleted a saved medical report summary');
  res.json({ ok: true });
});

// ---------------- MEDICINE INFORMATION ----------------

app.post('/api/medicines/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lang = resolveRequestLanguage(req);
  const m = getServerMessages(lang);
  const { medicineName } = req.body ?? {};
  if (
    typeof medicineName !== 'string' ||
    medicineName.trim().length < 2 ||
    medicineName.trim().length > 100
  ) {
    res.status(400).json({ error: m.medicineInvalidName });
    return;
  }

  try {
    const result = await searchMedicineInfo(medicineName.trim(), lang);
    logActivity(userId, 'medicine', `Searched medicine reference: "${medicineName.trim()}"`);
    res.json({ result });
  } catch (err) {
    const formatted = formatGeminiError(err, lang);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// ---------------- HEALTH RECORDS CRUD ----------------

app.get('/api/records', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = db
    .prepare(
      `SELECT id, title, category, record_date as recordDate, provider_or_source as providerOrSource,
              notes, created_at as createdAt, updated_at as updatedAt
       FROM health_records WHERE user_id = ? ORDER BY record_date DESC, created_at DESC`
    )
    .all(userId);
  res.json({ records: rows });
});

app.post('/api/records', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const { title, category, recordDate, providerOrSource, notes } = req.body ?? {};

  if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 120) {
    res.status(400).json({ error: m.recordTitle });
    return;
  }
  if (typeof category !== 'string' || !ALLOWED_RECORD_CATEGORIES.has(category)) {
    res.status(400).json({ error: m.recordCategory });
    return;
  }
  if (typeof recordDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    res.status(400).json({ error: m.recordDate });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO health_records (id, user_id, title, category, record_date, provider_or_source, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    title.trim(),
    category,
    recordDate,
    typeof providerOrSource === 'string' ? providerOrSource.trim().slice(0, 120) : '',
    typeof notes === 'string' ? notes.trim().slice(0, 2000) : '',
    now,
    now
  );

  logActivity(userId, 'record', `Added health record: "${title.trim()}"`);
  const record = db
    .prepare(
      `SELECT id, title, category, record_date as recordDate, provider_or_source as providerOrSource,
              notes, created_at as createdAt, updated_at as updatedAt
       FROM health_records WHERE id = ? AND user_id = ?`
    )
    .get(id, userId);

  res.status(201).json({ record });
});

app.put('/api/records/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const { title, category, recordDate, providerOrSource, notes } = req.body ?? {};

  if (typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 120) {
    res.status(400).json({ error: m.recordTitle });
    return;
  }
  if (typeof category !== 'string' || !ALLOWED_RECORD_CATEGORIES.has(category)) {
    res.status(400).json({ error: m.recordCategory });
    return;
  }
  if (typeof recordDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    res.status(400).json({ error: m.recordDate });
    return;
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `UPDATE health_records
       SET title = ?, category = ?, record_date = ?, provider_or_source = ?, notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      title.trim(),
      category,
      recordDate,
      typeof providerOrSource === 'string' ? providerOrSource.trim().slice(0, 120) : '',
      typeof notes === 'string' ? notes.trim().slice(0, 2000) : '',
      now,
      req.params.id,
      userId
    );

  if (info.changes === 0) {
    res.status(404).json({ error: m.recordNotFound });
    return;
  }

  logActivity(userId, 'record', `Updated health record: "${title.trim()}"`);
  const record = db
    .prepare(
      `SELECT id, title, category, record_date as recordDate, provider_or_source as providerOrSource,
              notes, created_at as createdAt, updated_at as updatedAt
       FROM health_records WHERE id = ? AND user_id = ?`
    )
    .get(req.params.id, userId);

  res.json({ record });
});

app.delete('/api/records/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const info = db
    .prepare('DELETE FROM health_records WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);

  if (info.changes === 0) {
    res.status(404).json({ error: m.recordNotFound });
    return;
  }
  logActivity(userId, 'record', 'Deleted a health record');
  res.json({ ok: true });
});

// ---------------- PREVENTIVE HEALTH TIPS ----------------

app.post('/api/tips/generate', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const lang = resolveRequestLanguage(req);
  const m = getServerMessages(lang);
  const { category, goal } = req.body ?? {};
  const trimmedCategory = typeof category === 'string' ? category.trim() : '';
  if (!trimmedCategory || trimmedCategory.length > 100) {
    res.status(400).json({ error: m.tipsInvalidCategory });
    return;
  }

  try {
    const tips = await generatePreventiveTips({
      category: trimmedCategory,
      goal: typeof goal === 'string' ? goal.trim().slice(0, 300) : '',
      age: user.age,
      preferences: user.preferences,
      language: lang,
    });
    if (!Array.isArray(tips) || tips.length === 0) {
      res.status(502).json({ error: m.tipsEmptyFromAi });
      return;
    }
    logActivity(user.id, 'tips', `Generated preventive health tips for "${trimmedCategory}"`);
    res.json({ tips });
  } catch (err) {
    const formatted = formatGeminiError(err, lang);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

function parseActionableSteps(rawJson: string | null | undefined): string[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

app.get('/api/tips/saved', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = db
    .prepare(
      `SELECT id, category, title, content, actionable_steps_json as actionableStepsJson, created_at as createdAt
       FROM saved_tips WHERE user_id = ? ORDER BY created_at DESC`
    )
    .all(userId) as Array<{
    id: string;
    category: string;
    title: string;
    content: string;
    actionableStepsJson: string;
    createdAt: string;
  }>;

  res.json({
    tips: rows.map((t) => ({
      id: t.id,
      category: t.category,
      title: t.title,
      content: t.content,
      actionableSteps: parseActionableSteps(t.actionableStepsJson),
      createdAt: t.createdAt,
    })),
  });
});

app.post('/api/tips/saved', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const { category, title, content, actionableSteps } = req.body ?? {};
  if (
    typeof category !== 'string' ||
    typeof title !== 'string' ||
    typeof content !== 'string' ||
    !title.trim() ||
    !content.trim()
  ) {
    res.status(400).json({ error: m.tipsSaveRequired });
    return;
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const steps = Array.isArray(actionableSteps) ? actionableSteps.slice(0, 6) : [];

  db.prepare(
    `INSERT INTO saved_tips (id, user_id, category, title, content, actionable_steps_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, category.trim(), title.trim(), content.trim(), JSON.stringify(steps), createdAt);

  logActivity(userId, 'tips', `Saved wellness tip: "${title.trim()}"`);
  res.status(201).json({
    tip: {
      id,
      category: category.trim(),
      title: title.trim(),
      content: content.trim(),
      actionableSteps: steps,
      createdAt,
    },
  });
});

app.delete('/api/tips/saved/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const m = getServerMessages(resolveRequestLanguage(req));
  const info = db
    .prepare('DELETE FROM saved_tips WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);

  if (info.changes === 0) {
    res.status(404).json({ error: m.tipsNotFound });
    return;
  }
  logActivity(userId, 'tips', 'Removed a saved wellness tip');
  res.json({ ok: true });
});

app.all('/api/*', (req, res) => {
  const m = getServerMessages(resolvePublicLanguage(req));
  res.status(404).json({ error: m.endpointNotFound });
});

// ---------------- SERVE FRONTEND (DEV & PROD) ----------------

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    let viteMiddleware: express.RequestHandler | null = null;
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          hmr: false,
        },
        appType: 'spa',
      });
      viteMiddleware = vite.middlewares;
    })();

    viteReady.catch((err) => {
      console.error('Failed to initialize Vite dev middleware:', err);
      process.exit(1);
    });

    app.use((req, res, next) => {
      if (viteMiddleware) {
        viteMiddleware(req, res, next);
        return;
      }
      viteReady
        .then(() => {
          if (viteMiddleware) {
            viteMiddleware(req, res, next);
          } else {
            next();
          }
        })
        .catch(next);
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`MediGuide AI server listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('Server listen error:', err);
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
