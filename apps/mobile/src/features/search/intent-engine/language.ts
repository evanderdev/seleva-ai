interface NativeLanguageModule {
  identifyLanguage?(text: string): Promise<unknown>;
  translateToEnglish?(text: string, sourceLanguage: string): Promise<unknown>;
}

export interface LanguageIdentification { language: string | 'und'; confidence: number; }
export interface LanguageService {
  identify(text: string): Promise<LanguageIdentification>;
  translateToEnglish(text: string, sourceLanguage: string): Promise<string>;
}

export function getLanguageService(): LanguageService | null {
  let native: NativeLanguageModule | undefined = (globalThis as { expo?: { modules?: Record<string, NativeLanguageModule> } }).expo?.modules?.SelevaPhotoEngine;
  try {
    if (!native) {
      // The React Native package is ESM in Jest and is only available in a native build.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const reactNative = require('react-native') as { NativeModules?: { NativeUnimoduleProxy?: { exportedMethods?: Record<string, unknown> }; SelevaPhotoEngine?: NativeLanguageModule } };
      native = reactNative.NativeModules?.SelevaPhotoEngine;
    }
  } catch {
    return null;
  }
  if (!native?.identifyLanguage || !native.translateToEnglish) return null;
  return {
    async identify(text) {
      const result = await native.identifyLanguage!(text);
      if (!result || typeof result !== 'object') return { language: 'und', confidence: 0 };
      const payload = result as { language?: unknown; confidence?: unknown };
      return {
        language: typeof payload.language === 'string' ? payload.language : 'und',
        confidence: typeof payload.confidence === 'number' ? Math.max(0, Math.min(1, payload.confidence)) : 0,
      };
    },
    async translateToEnglish(text, sourceLanguage) {
      const result = await native.translateToEnglish!(text, sourceLanguage);
      if (typeof result !== 'string') throw new Error('INVALID_TRANSLATION');
      return result;
    },
  };
}
