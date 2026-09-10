import { builtinMatchers, runMatcherRegistry } from './matchers';

describe('intent matcher registry', () => {
  it('runs deterministic matchers by priority and returns evidence', () => {
    const results = runMatcherRegistry(builtinMatchers, { text: 'find blurry screenshots' });
    expect(results.map((result) => result.evidence)).toEqual([
      ['screenshot:screenshot'],
      ['quality:blur'],
    ]);
  });
});
