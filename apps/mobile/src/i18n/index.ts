import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en, es, ptBR } from './messages';

export const locales = ['en', 'pt-BR', 'es'] as const;
export type Locale = (typeof locales)[number];
export function resolveLocale(locale: string): Locale {
  const language = locale.toLowerCase().replace('_', '-');
  if (language === 'pt' || language.startsWith('pt-')) return 'pt-BR';
  if (language === 'es' || language.startsWith('es-')) return 'es';
  return 'en';
}
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'pt-BR': { translation: ptBR },
    es: { translation: es },
  },
  lng: resolveLocale(Intl.DateTimeFormat().resolvedOptions().locale),
  fallbackLng: 'en',
  supportedLngs: [...locales],
  showSupportNotice: false,
  interpolation: { escapeValue: false },
  initImmediate: false,
});
export default i18n;
