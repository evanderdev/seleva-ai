import { actionIntentSchema, pageRequestSchema, personSchema, qualitySignalSchema, queryPlanSchema, scanOptionsSchema, searchIntentSchema, selectionSchema } from './index';

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

  it('validates the platform-independent selection domain', () => {
    expect(personSchema.safeParse({ id: 'person-1', confidence: 0.8 }).success).toBe(true);
    expect(qualitySignalSchema.safeParse({ kind: 'blur', score: 1.2 }).success).toBe(false);
    expect(selectionSchema.safeParse({ id: 'selection-1', name: 'Trip', assetIds: ['asset-1'], createdAt: 1, updatedAt: 2 }).success).toBe(true);
    expect(searchIntentSchema.safeParse({ kind: 'refine', query: {}, operation: 'restrict' }).success).toBe(true);
    expect(searchIntentSchema.safeParse({ kind: 'refine', query: {}, operation: 'broaden' }).success).toBe(true);
    expect(searchIntentSchema.safeParse({ kind: 'refine', query: {}, operation: 'expand' }).success).toBe(false);
    expect(actionIntentSchema.safeParse({ action: 'trash', requiresConfirmation: true }).success).toBe(true);
    expect(actionIntentSchema.safeParse({ action: 'trash', requiresConfirmation: false }).success).toBe(false);
  });
});
