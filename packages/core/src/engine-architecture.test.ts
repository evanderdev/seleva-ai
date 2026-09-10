import { CapabilityResolver, createCapabilityRegistry, type CapabilityPlugin, type CandidateIndex, SearchComposition } from './index';
import { and, predicate, searchExpressionSchema } from './search-expression';

function runtime() { return { platform: 'android' as const, osVersion: 36, permissions: [], models: [], nativeApis: [], resources: 'normal' as const }; }
describe('capability architecture', () => {
  it('registers the catalog once and rejects duplicate IDs', () => {
    const registry = createCapabilityRegistry();
    expect(registry.list()).toHaveLength(15);
    expect(() => registry.register(registry.list()[0]!)).toThrow('DUPLICATE_CAPABILITY');
  });
  it('resolves unavailable platform providers and exposes fallback status', () => {
    const plugin: CapabilityPlugin = { manifest: { id: 'test.primary', version: '1', functions: ['search'], platforms: { android: { minVersion: 99 } }, cost: 'cheap', persistence: 'none', dependencies: [], fallbackCapabilities: ['metadata.core'] }, searchEngines: [] };
    const registry = createCapabilityRegistry(); registry.register(plugin);
    const result = new CapabilityResolver(registry).resolve('test.primary', runtime(), 'search');
    expect(result.availability.status).toBe('unavailable');
    expect(result.availability).toMatchObject({ reason: 'OS_INCOMPATIBLE' });
  });
  it('validates the canonical boolean AST', () => {
    const expression = and(
      predicate('content.screenshot', 'eq', { field: 'screenshot', value: true }),
      predicate('text.ocr', 'containsAny', { field: 'ocrTerms', value: ['invoice'] }),
      { type: 'not', child: predicate('metadata.core', 'eq', { field: 'favorites', value: true }) },
    );
    expect(searchExpressionSchema.safeParse(expression).success).toBe(true);
    expect(expression.type).toBe('and');
    expect(predicate('text.ocr', 'containsAny', 'invoice').capability).toBe('text.ocr');
    expect(searchExpressionSchema.safeParse({ type: 'predicate', capability: 'text.ocr', operator: 'eq', value: undefined }).success).toBe(false);
  });
  it('reports unavailable predicates without pretending search completed', async () => {
    const registry = createCapabilityRegistry();
    const index: CandidateIndex = { universe: () => ({ key: 'all' }), intersect: () => ({ key: 'intersection' }), union: () => ({ key: 'union' }), subtract: () => ({ key: 'subtract' }), page: async () => ({ assets: [] }), release: () => undefined };
    const result = await new SearchComposition(new CapabilityResolver(registry), index).execute({ expression: predicate('semantic.visual', 'similar', 'dog') }, { limit: 20 }, { runtime: runtime() });
    expect(result.report.status).toBe('unavailable');
    expect(result.report.unavailable[0]?.capability).toBe('semantic.visual');
    expect(result.assets).toHaveLength(0);
  });
});
