import { z } from 'zod';

export const capabilityIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/);
export type CapabilityId = z.infer<typeof capabilityIdSchema>;
export const searchPredicateSchema = z.strictObject({
  type: z.literal('predicate'), capability: capabilityIdSchema,
  operator: z.string().min(1).max(80), value: z.json(),
});
export type SearchPredicate = z.infer<typeof searchPredicateSchema>;
export type SearchExpression = SearchPredicate
  | { type: 'and' | 'or'; children: SearchExpression[] }
  | { type: 'not'; child: SearchExpression };
const recursiveExpression: z.ZodType<SearchExpression> = z.lazy(() => z.union([
  searchPredicateSchema,
  z.strictObject({ type: z.enum(['and', 'or']), children: z.array(recursiveExpression).max(64) }),
  z.strictObject({ type: z.literal('not'), child: recursiveExpression }),
]));
export const searchExpressionSchema = z.unknown().superRefine((value, ctx) => {
  const pending: Array<[unknown, number]> = [[value, 0]];
  let nodes = 0;
  while (pending.length) {
    const [node, depth] = pending.pop()!;
    if (++nodes > 256 || depth > 24) { ctx.addIssue({ code: 'custom', message: 'EXPRESSION_TOO_COMPLEX' }); return; }
    if (typeof node !== 'object' || node === null) continue;
    if ('children' in node && Array.isArray(node.children)) pending.push(...node.children.map((child): [unknown, number] => [child, depth + 1]));
    if ('child' in node) pending.push([node.child, depth + 1]);
  }
}).pipe(recursiveExpression);
export const rankingRequestSchema = z.strictObject({ capability: capabilityIdSchema, strategy: z.string().min(1) });
export const searchRequestSchema = z.strictObject({
  expression: searchExpressionSchema.default({ type: 'and', children: [] }),
  ranking: rankingRequestSchema.optional(),
  target: z.strictObject({ minSpaceToRecover: z.number().int().positive().optional(), maxResults: z.number().int().positive().optional() }).optional(),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export function predicate(capability: CapabilityId, operator: string, value: SearchPredicate['value']): SearchPredicate {
  return searchPredicateSchema.parse({ type: 'predicate', capability, operator, value });
}
export function and(...children: SearchExpression[]): SearchExpression {
  const flat = children.flatMap(child => child.type === 'and' ? child.children : [child]);
  return flat.length === 1 ? flat[0]! : { type: 'and', children: flat };
}
export function predicates(expression: SearchExpression): SearchPredicate[] {
  if (expression.type === 'predicate') return [expression];
  if (expression.type === 'not') return predicates(expression.child);
  return expression.children.flatMap(predicates);
}

/** Boundary adapter for persisted/user-facing filters. New code should build predicates directly. */
export interface StructuredSearchPlan {
  filters?: Record<string, unknown>;
  exclusions?: Record<string, unknown>;
  ranking?: { strategy: string };
  target?: { minSpaceToRecover?: number; maxResults?: number };
}
export function structuredPlanToExpression(plan: StructuredSearchPlan): SearchExpression {
  const children: SearchExpression[] = [];
  const filters = plan.filters ?? {};
  const map: Record<string, string> = {
    before: 'before', after: 'after', mediaTypes: 'in', screenshot: 'eq', favorite: 'eq', duplicate: 'eq', similar: 'eq',
    hasFaces: 'eq', labels: 'containsAny', ocrTerms: 'containsAny', maxQuality: 'lte', minBlur: 'gte', minFileSize: 'gte', people: 'containsAny', places: 'containsAny', sceneLabels: 'containsAny', source: 'eq',
  };
  const jsonValue = (value: unknown): SearchPredicate['value'] => JSON.parse(JSON.stringify(value)) as SearchPredicate['value'];
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) {
    const capability = key === 'before' || key === 'after' ? 'query.date' : key === 'ocrTerms' ? 'text.ocr' : key === 'screenshot' ? 'content.screenshot' : key === 'duplicate' ? 'duplicate.exact' : key === 'similar' ? 'similarity.perceptual' : key === 'maxQuality' || key === 'minBlur' ? 'quality.visual' : 'metadata.core';
    children.push(predicate(capability, map[key] ?? 'eq', jsonValue({ field: key, value })));
  }
  const exclusions = plan.exclusions ?? {};
  for (const [key, value] of Object.entries(exclusions)) if (value === true || (Array.isArray(value) && value.length)) {
    const capability = key === 'screenshots' ? 'content.screenshot' : key === 'labels' ? 'visual.labels' : 'metadata.core';
    children.push({ type: 'not', child: predicate(capability, key === 'labels' ? 'containsAny' : 'eq', jsonValue({ field: key, value })) });
  }
  const expression = children.length ? and(...children) : { type: 'and' as const, children: [] };
  return searchExpressionSchema.parse(expression);
}
export function expressionToStructuredPlan(expression: SearchExpression): StructuredSearchPlan {
  const plan: StructuredSearchPlan = { filters: {}, exclusions: {} };
  const visit = (node: SearchExpression, negative = false) => {
    if (node.type === 'not') return visit(node.child, !negative);
    if (node.type !== 'predicate') return node.children.forEach(child => visit(child, negative));
    const value = node.value;
    const field = typeof value === 'object' && value !== null && 'field' in value && typeof value.field === 'string' ? value.field : undefined;
    const actual = field && typeof value === 'object' && value !== null && 'value' in value ? value.value : value;
    if (!field) return;
    const destination = negative ? plan.exclusions! : plan.filters!;
    destination[field] = actual;
  };
  visit(expression);
  if (!Object.keys(plan.filters!).length) delete plan.filters;
  if (!Object.keys(plan.exclusions!).length) delete plan.exclusions;
  return plan;
}
