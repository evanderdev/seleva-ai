import { createIntentEngine } from './intent-engine/engine';
import { promptSchema } from './prompt';

const engine = createIntentEngine();
const now = new Date(2026, 8, 9, 12);

describe('Seleva Intent Engine', () => {
  it.each([
    'encontre fotos borradas',
    'find blurry photos',
    'buscar fotos borrosas',
  ])('uses canonical filters across languages: %s', async (text) => {
    const result = await engine.interpret({ text, context: { now } });
    expect(result.plan.query?.filters).toMatchObject({
      mediaTypes: ['photo'],
      minBlur: 0.55,
    });
    expect(result.plan.query?.filters?.ocrTerms).toBeUndefined();
  });

  it('preserves a meaningful quoted OCR term', async () => {
    const result = await engine.interpret({
      text: 'encontre prints "Jira"',
      context: { now },
    });
    expect(result.plan.query?.filters).toMatchObject({
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
    expect(result.plan.query?.filters).toMatchObject({
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
    expect(result.plan.query?.filters?.before).toBeUndefined();
    expect(result.plan.query?.filters?.ocrTerms).toEqual(['piano']);
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
});
