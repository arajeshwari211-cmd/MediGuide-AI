import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, apiRequest, clearAuthToken, setAuthToken } from '../services/api.ts';
import type { SupportedLanguage, User } from '../types/index.ts';
import { useTheme } from './ThemeContext.tsx';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    age?: number | null;
    language?: SupportedLanguage;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (payload: Partial<Pick<User, 'name' | 'age' | 'avatarUrl' | 'preferences' | 'theme' | 'language' | 'notificationsEnabled' | 'privacySaveReports'>>) => Promise<User>;
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: User }>('/api/auth/me');
      setUser(data.user);
      setTheme(data.user.theme);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAuthToken();
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [setTheme]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await apiRequest<{ user: User; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
    setTheme(data.user.theme);
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
    age?: number | null;
    language?: SupportedLanguage;
  }) => {
    const data = await apiRequest<{ user: User; token?: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
    setTheme(data.user.theme);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      clearAuthToken();
      setUser(null);
    }
  };

  const updateProfile = async (
    payload: Partial<
      Pick<
        User,
        | 'name'
        | 'age'
        | 'avatarUrl'
        | 'preferences'
        | 'theme'
        | 'language'
        | 'notificationsEnabled'
        | 'privacySaveReports'
      >
    >
  ): Promise<User> => {
    const data = await apiRequest<{ user: User }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setUser(data.user);
    if (payload.theme) {
      setTheme(data.user.theme);
    }
    return data.user;
  };

  const deleteAccount = async (password: string) => {
    await apiRequest('/api/profile', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    clearAuthToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        updateProfile,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
