import { DICTIONARIES, normalizeClientLanguage } from '../i18n/index.ts';
import type { SupportedLanguage } from '../types/index.ts';

const TOKEN_STORAGE_KEY = 'mediguide_session_token';
let inMemoryToken: string | null = null;

function getActiveClientLanguage(): SupportedLanguage {
  try {
    const docLang = typeof document !== 'undefined' ? document.documentElement.lang : '';
    if (docLang) {
      return normalizeClientLanguage(docLang);
    }
    return normalizeClientLanguage(localStorage.getItem('mg_language'));
  } catch {
    return 'en';
  }
}

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  } catch {
    // ignore storage errors in restricted contexts
  }
  return null;
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors in restricted contexts
  }
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiRequest<T>(
  url: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const activeLanguage = getActiveClientLanguage();
  const apiErrors = DICTIONARIES[activeLanguage].apiErrors;

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };
  if (fetchOptions.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (!headers['X-MediGuide-Language']) {
    headers['X-MediGuide-Language'] = activeLanguage;
  }

  const token = getAuthToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
      signal: fetchOptions.signal ?? controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : { error: await response.text() };

    if (!response.ok) {
      throw new ApiError(
        data?.error || apiErrors.statusFallback(response.status),
        response.status
      );
    }

    return data as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(
        apiErrors.timeout(Math.round(timeoutMs / 1000)),
        408
      );
    }
    if (err instanceof TypeError) {
      throw new ApiError(apiErrors.network, 0);
    }
    throw new ApiError(
      err instanceof Error && err.message ? err.message : apiErrors.unexpected,
      500
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const NOTIFICATIONS_UPDATED_EVENT = 'mediguide:notifications-updated';

export function emitNotificationsUpdated(): void {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
}
