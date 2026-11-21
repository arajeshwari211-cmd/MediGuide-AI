import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DICTIONARIES,
  normalizeClientLanguage,
  type TranslationDictionary,
} from '../i18n/index.ts';
import type { SupportedLanguage } from '../types/index.ts';
import { useAuth } from './AuthContext.tsx';

const LANGUAGE_STORAGE_KEY = 'mg_language';

interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    try {
      return normalizeClientLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    if (user?.language) {
      const normalized = normalizeClientLanguage(user.language);
      setLanguageState(normalized);
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
      } catch {
        // ignore storage restrictions
      }
    }
  }, [user?.id, user?.language]);

  const t = DICTIONARIES[language] ?? DICTIONARIES.en;

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.common.appTitle;
  }, [language, t.common.appTitle]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    const normalized = normalizeClientLanguage(lang);
    setLanguageState(normalized);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      // ignore storage restrictions
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
