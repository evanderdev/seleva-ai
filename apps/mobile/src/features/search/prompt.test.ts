import { createIntentEngine } from './intent-engine/engine';
import { promptSchema } from './prompt';
import { predicates, type SearchExpression } from '@seleva/core';

function filtersOf(query: { expression: SearchExpression } | undefined) {
  if (!query) return undefined;
  const filters: Record<string, unknown> = {};
  for (const item of predicates(query.expression)) {
    if (typeof item.value !== 'object' || item.value === null || Array.isArray(item.value)) continue;
    const value = item.value as Record<string, unknown>;
    if (typeof value.field === 'string') filters[value.field] = value.value;
  }
  return filters;
}

const engine = createIntentEngine();
const now = new Date(2026, 8, 9, 12);

describe('Seleva Intent Engine', () => {
  it.each([
    'encontre fotos borradas',
    'find blurry photos',
    'buscar fotos borrosas',
  ])('uses canonical filters across languages: %s', async (text) => {
    const result = await engine.interpret({ text, context: { now } });
    expect(filtersOf(result.plan.query)).toMatchObject({
      mediaTypes: ['photo'],
      minBlur: 0.55,
    });
    expect(filtersOf(result.plan.query)?.ocrTerms).toBeUndefined();
  });

  it('preserves a meaningful quoted OCR term', async () => {
    const result = await engine.interpret({
      text: 'encontre prints "Jira"',
      context: { now },
    });
    expect(filtersOf(result.plan.query)).toMatchObject({
      screenshot: true,
      ocrTerms: ['jira'],
    });
  });

  it.each([
    'Quero liberar espaço',
    'I want to free some storage',
    'Quiero liberar espacio',
  ])('creates an equivalent free-space intent: %s', async (text) => {
    const result = await engine.interpret({ text, context: { now } });
    expect(result.interpretation.intent).toMatchObject({
      cleanupCandidate: true,
      freeSpace: true,
    });
    expect(result.plan.status).toBe('clarification');
  });

  it('resolves a natural relative date using an injected clock', async () => {
    const result = await engine.interpret({
      text: 'show screenshots from yesterday',
      context: { now },
    });
    expect(filtersOf(result.plan.query)).toMatchObject({
      screenshot: true,
      after: new Date(2026, 8, 8).getTime() - 1,
      before: new Date(2026, 8, 9).getTime(),
    });
  });

  it('does not interpret an OCR substring as an age command', async () => {
    const result = await engine.interpret({
      text: 'prints piano',
      context: { now },
    });
    expect(filtersOf(result.plan.query)?.before).toBeUndefined();
    expect(filtersOf(result.plan.query)?.ocrTerms).toEqual(['piano']);
  });

  it('never sends an unsupported semantic output to the planner', async () => {
    const invalidSemantic = {
      match: async () => [
        { concept: 'bad', similarity: 0.99, intent: { action: 'whatever' } },
      ],
      dispose: async () => undefined,
    };
    const result = await createIntentEngine({
      semantic: invalidSemantic,
    }).interpret({
      text: 'something totally unusual',
      context: { now },
    });
    expect(result.plan.status).toBe('clarification');
    expect(result.interpretation.intent.action).toBe('find');
  });

  it('validates the input boundary', async () => {
    expect(promptSchema.safeParse('  ').success).toBe(false);
    await expect(engine.interpret({ text: 'x'.repeat(501) })).rejects.toThrow();
  });

  it.each([
    ['find screenshots', { screenshot: true }],
    ['encontre prints', { screenshot: true }],
    ['buscar capturas de pantalla', { screenshot: true }],
  ])('golden corpus keeps multilingual intent stable: %s', async (text, expected) => {
    const result = await engine.interpret({ text, context: { now } });
    expect(filtersOf(result.plan.query)).toMatchObject(expected);
    expect(result.normalized.originalText).toBe(text);
  });

  it('returns a reviewable ActionIntent for destructive language', async () => {
    const result = await engine.interpret({ text: 'delete blurry photos', context: { now } });
    expect(result.plan.action).toEqual({ action: 'trash', requiresConfirmation: true });
    expect(result.plan.requiresReview).toBe(true);
  });

  it('applies a refinement to the accumulated selection context', async () => {
    const first = await engine.interpret({ text: 'screenshots', context: { now } });
    const second = await engine.interpret({
      text: 'refine before 2025',
      context: { now, selectionContext: first.selectionContext },
    });
    expect(filtersOf(second.plan.query)).toMatchObject({ screenshot: true, before: new Date(2025, 0, 1).getTime() });
  });
});
