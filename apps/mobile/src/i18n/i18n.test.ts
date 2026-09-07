import i18n, { resolveLocale } from './index';
import { en, es, ptBR } from './messages';

it('provides every message in all supported languages', () => {
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
});
it('resolves regional variants with English fallback', async () => {
  expect(resolveLocale('es-MX')).toBe('es');
  expect(resolveLocale('pt_BR')).toBe('pt-BR');
  expect(resolveLocale('fr-FR')).toBe('en');
  await i18n.changeLanguage('pt-BR');
  expect(i18n.t('home')).toBe('Início');
  await i18n.changeLanguage('en');
});
