import { pageRequestSchema, queryPlanSchema, scanOptionsSchema } from './index';

describe('boundary validation', () => {
  it('protects favorites by default', () => {
    expect(queryPlanSchema.parse({}).exclusions.favorites).toBe(true);
  });
  it('rejects invalid dates and unknown execution instructions', () => {
    expect(
      queryPlanSchema.safeParse({ filters: { after: 20, before: 10 } }).success,
    ).toBe(false);
    expect(queryPlanSchema.safeParse({ delete: true }).success).toBe(false);
  });
  it('rejects out of range scores', () => {
    expect(
      queryPlanSchema.safeParse({ filters: { minBlur: 1.1 } }).success,
    ).toBe(false);
  });
  it('bounds native batches and result pages', () => {
    expect(scanOptionsSchema.safeParse({ batchSize: 50000 }).success).toBe(
      false,
    );
    expect(pageRequestSchema.safeParse({ limit: 50000 }).success).toBe(false);
    expect(pageRequestSchema.parse({}).limit).toBe(50);
  });
});
