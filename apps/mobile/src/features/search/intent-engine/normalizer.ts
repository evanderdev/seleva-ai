import type { IntentNormalizer } from './types';
import { getLanguageService } from './language';

export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export const normalizer: IntentNormalizer = {
  async normalize(text, context) {
    const originalText = text.normalize('NFKC').replace(/\s+/g, ' ').trim();
    const service = getLanguageService();
    let detectedLanguage = context.locale?.split('-')[0];
    let languageConfidence = 0;
    if (service && originalText.length >= 12) {
      try {
        const detected = await service.identify(originalText);
        if (detected.language !== 'und') {
          detectedLanguage = detected.language;
          languageConfidence = detected.confidence;
        }
      } catch { /* deterministic multilingual fallback remains available */ }
    }
    const isEnglish = detectedLanguage === 'en';
    if (service && detectedLanguage && !isEnglish && languageConfidence >= 0.55) {
      try {
        const canonicalText = await service.translateToEnglish(originalText, detectedLanguage);
        return { originalText, normalizedOriginalText: originalText, originalLanguage: detectedLanguage, detectedLanguage, languageConfidence, canonicalText, canonicalLanguage: 'en', translationStatus: 'translated', normalizationStrategy: 'translation' };
      } catch { /* translation models are optional and may be unavailable offline */ }
    }
    return { originalText, normalizedOriginalText: originalText, originalLanguage: detectedLanguage, detectedLanguage, languageConfidence, canonicalLanguage: isEnglish ? 'en' : 'original', translationStatus: isEnglish ? 'not-needed' : service ? 'failed' : 'unavailable', normalizationStrategy: 'multilingual' };
  },
};
