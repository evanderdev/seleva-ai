import type { IntentNormalizer } from './types';

export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export const normalizer: IntentNormalizer = {
  async normalize(text, context) {
    // UI locale is a hint, not language detection or a translation claim.
    return {
      originalText: text.normalize('NFC').replace(/\s+/g, ' ').trim(),
      originalLanguage: context.locale,
      normalizationStrategy: 'multilingual',
    };
  },
};
