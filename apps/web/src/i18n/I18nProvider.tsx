import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  translate,
  type Language,
  type MessageKey,
} from './messages';

const LANG_KEY = 'rmc:lang';

type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

interface I18n {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TFunction;
}

const I18nContext = createContext<I18n | null>(null);

function loadLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && saved in LANGUAGES) return saved as Language;
  } catch {
    // ignore
  }
  return DEFAULT_LANGUAGE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(loadLanguage);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
