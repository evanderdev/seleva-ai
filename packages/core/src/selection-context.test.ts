import { createSelectionContext, reduceSelectionContext } from './index';
import { predicate } from './search-expression';

describe('composable SelectionContext', () => {
  it('accumulates AND restrictions and explicit exclusions', () => {
    const first = reduceSelectionContext(undefined, 'new', { expression: predicate('content.screenshot', 'eq', true) });
    const second = reduceSelectionContext(first, 'restrict', { expression: predicate('query.date', 'before', { field: 'before', value: 2025 }) });
    const third = reduceSelectionContext(second, 'exclude', { expression: predicate('metadata.core', 'eq', { field: 'favorite', value: true }) });
    expect(first.query.expression.type).toBe('predicate');
    expect(second.query.expression.type).toBe('and');
    expect(third.query.expression.type).toBe('and');
  });
  it('removes a predicate and broadens with OR', () => {
    const context = createSelectionContext({ expression: { type: 'and', children: [predicate('content.screenshot', 'eq', true), predicate('query.date', 'before', { field: 'before', value: 2025 })] } });
    const removed = reduceSelectionContext(context, 'remove', { expression: predicate('content.screenshot', 'eq', true) });
    const broadened = reduceSelectionContext(removed, 'broaden', { expression: predicate('query.date', 'after', { field: 'after', value: 2018 }) });
    expect(removed.query.expression.type).toBe('and');
    expect(broadened.query.expression.type).toBe('or');
  });
});
