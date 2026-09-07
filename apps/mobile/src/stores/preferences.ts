import { create } from 'zustand';
import i18n, { type Locale, resolveLocale } from '../i18n';

interface Preferences {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  themeMode: 'light' | 'dark';
  setThemeMode: (mode: 'light' | 'dark') => void;
}
export const usePreferences = create<Preferences>((set) => ({
  locale: resolveLocale(i18n.language),
  setLocale: (locale) => {
    void i18n.changeLanguage(locale);
    set({ locale });
  },
  themeMode: 'light',
  setThemeMode: (themeMode) => set({ themeMode }),
}));
