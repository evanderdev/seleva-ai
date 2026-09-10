import { createSelectionContext, reduceSelectionContext } from './index';

describe('SelectionContext reducer', () => {
  it('accumulates restrictions and excludes without mutating the prior context', () => {
    const first = reduceSelectionContext(undefined, 'new', { filters: { screenshot: true } });
    const second = reduceSelectionContext(first, 'restrict', { filters: { before: 2025 } });
    const third = reduceSelectionContext(second, 'exclude', { filters: { favorite: true } });
    expect(first.query.filters?.before).toBeUndefined();
    expect(second.query.filters).toMatchObject({ screenshot: true, before: 2025 });
    expect(third.query.exclusions.favorites).toBe(true);
  });

  it('removes a restriction and broadens date ranges', () => {
    const context = createSelectionContext({ filters: { before: 2025, after: 2020, screenshot: true } });
    const removed = reduceSelectionContext(context, 'remove', { filters: { screenshot: true } });
    const broadened = reduceSelectionContext(removed, 'broaden', { filters: { before: 2026, after: 2018 } });
    expect(removed.query.filters?.screenshot).toBeUndefined();
    expect(broadened.query.filters).toMatchObject({ before: 2026, after: 2018 });
  });
});
