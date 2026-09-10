import { actionIntentSchema, pageRequestSchema, personSchema, qualitySignalSchema, searchExpressionSchema, searchIntentSchema, selectionSchema } from './index';
import { predicate } from './search-expression';

describe('domain boundaries', () => {
  it('validates composable search expressions', () => {
    expect(searchExpressionSchema.safeParse({ type: 'and', children: [predicate('content.screenshot', 'eq', true)] }).success).toBe(true);
    expect(searchExpressionSchema.safeParse({ type: 'predicate', capability: 'bad', operator: 'eq', value: true }).success).toBe(false);
  });
  it('validates selections and actions at the boundary', () => {
    const expression = predicate('metadata.core', 'eq', { field: 'mediaType', value: 'photo' });
    expect(personSchema.safeParse({ id: 'person-1', confidence: 0.8 }).success).toBe(true);
    expect(qualitySignalSchema.safeParse({ kind: 'blur', score: 1.2 }).success).toBe(false);
    expect(selectionSchema.safeParse({ id: 'selection-1', name: 'Trip', assetIds: ['asset-1'], query: { expression }, createdAt: 1, updatedAt: 2 }).success).toBe(true);
    expect(searchIntentSchema.safeParse({ kind: 'refine', query: { expression }, operation: 'broaden' }).success).toBe(true);
    expect(actionIntentSchema.safeParse({ action: 'trash', requiresConfirmation: true }).success).toBe(true);
    expect(actionIntentSchema.safeParse({ action: 'trash', requiresConfirmation: false }).success).toBe(false);
    expect(pageRequestSchema.safeParse({ limit: 50000 }).success).toBe(false);
  });
});
