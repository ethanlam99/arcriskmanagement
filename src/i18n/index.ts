import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';
import id from './locales/id.json';

const STORAGE_KEY = 'arc.language';
const DEFAULT_LANG = 'en';
export const SUPPORTED_LANGS = ['en', 'zh', 'id'] as const;
export type Lang = typeof SUPPORTED_LANGS[number];

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)) {
      return stored as Lang;
    }
  } catch {
    // SSR / disabled localStorage — fall through to default
  }
  return DEFAULT_LANG;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    id: { translation: id },
  },
  lng: readStoredLang(),
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false },
  // i18next v23 defaults to JSON v4 plural format: use key_one / key_other.
});

export function changeLanguage(lang: Lang): void {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage disabled — language still changes in-memory for the session
  }
}

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  zh: '简体中文',
  id: 'Bahasa Indonesia',
};

export const LANG_SHORT_LABELS: Record<Lang, string> = {
  en: 'EN',
  zh: '中文',
  id: 'ID',
};

export default i18n;
