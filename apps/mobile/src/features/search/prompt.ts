import { z } from 'zod';
type Category = 'all' | 'photos' | 'videos' | 'screenshots' | 'favorites';
export const promptSchema = z.string().trim().min(1).max(500);

export function planPrompt(prompt: string): {
  category: Category;
  before?: number;
  minFileSize?: number;
  duplicate?: boolean;
  similar?: boolean;
  minBlur?: number;
  ocrTerms?: string[];
} {
  const value = promptSchema
    .parse(prompt)
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const category: Category = /screenshot|print|captura/.test(value)
    ? 'screenshots'
    : /video/.test(value)
      ? 'videos'
      : /favorite|favorit|favorito/.test(value)
        ? 'favorites'
        : /photo|foto/.test(value)
          ? 'photos'
          : 'all';
  const before = /\b(old|older|antig\w*|velh\w*|year\w*|ano\w*)\b/.test(value)
    ? new Date(new Date().setFullYear(new Date().getFullYear() - 1)).getTime()
    : undefined;
  const minFileSize = /large|grande|pesad/.test(value)
    ? 500 * 1024 * 1024
    : undefined;
  const duplicate = /duplicate|duplicat|repetid|igual/.test(value)
    ? true
    : undefined;
  const similar = /similar|parecid/.test(value) ? true : undefined;
  const minBlur = /blurry|blur|borrad|borros|desfoc/.test(value)
    ? 0.55
    : undefined;
  // Remove complete command words, preserving only meaningful OCR terms.
  const commandWord =
    /^(find|search|show|clean|encontr\w*|busc\w*|mostr\w*|limp\w*|revis\w*|liber\w*|old|older|photo\w*|foto\w*|video\w*|large|grand\w*|pesad\w*|blurr\w*|blur|borr\w*|desfoc\w*|duplic\w*|repetid\w*|igual\w*|similar\w*|parecid\w*|screenshot\w*|print\w*|captura\w*|antig\w*|velh\w*|year\w*|ano\w*|favorit\w*|from|the|with|before|last|mais|com|que|uma|uns|das|dos|por|para|tela|pantalla|hace|mas|del|los|las|con|pasado|passado)$/;
  const ocrTerms = value
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 3 && !commandWord.test(term))
    .slice(0, 5);
  return {
    category,
    before,
    minFileSize,
    duplicate,
    similar,
    minBlur,
    ocrTerms: ocrTerms.length ? ocrTerms : undefined,
  };
}
