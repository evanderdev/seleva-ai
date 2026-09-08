import { planPrompt, promptSchema } from './prompt';
describe('shared home and result search', () => {
  it.each([
    'encontre fotos borradas',
    'find blurry photos',
    'buscar fotos borrosas',
  ])('does not turn command words into OCR filters: %s', (prompt) => {
    expect(planPrompt(prompt)).toMatchObject({
      category: 'photos',
      minBlur: 0.55,
    });
    expect(planPrompt(prompt).ocrTerms).toBeUndefined();
  });
  it('keeps meaningful OCR terms alongside a category', () => {
    expect(planPrompt('encontre prints Jira')).toMatchObject({
      category: 'screenshots',
      ocrTerms: ['jira'],
    });
  });
  it('creates the same filters for a search edited in the sheet', () => {
    expect(planPrompt('vídeos grandes')).toMatchObject({
      category: 'videos',
      minFileSize: 524288000,
      ocrTerms: undefined,
    });
    expect(planPrompt('fotos parecidas')).toMatchObject({
      similar: true,
      ocrTerms: undefined,
    });
  });
  it('validates at the intent boundary', () => {
    expect(promptSchema.safeParse('  ').success).toBe(false);
    expect(() => planPrompt('x'.repeat(501))).toThrow();
  });
  it('does not interpret an OCR substring as an age command', () => {
    expect(planPrompt('prints piano').before).toBeUndefined();
  });
});
