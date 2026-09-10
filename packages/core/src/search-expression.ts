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
