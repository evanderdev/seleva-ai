import { and, predicates, searchRequestSchema, type SearchExpression, type SearchRequest } from './search-expression';
import type { SelectionContext, SelectionOperation } from './index';

function without(expression: SearchExpression, keys: Set<string>): SearchExpression | undefined {
  if (expression.type === 'predicate') return keys.has(`${expression.capability}:${expression.operator}`) ? undefined : expression;
  if (expression.type === 'not') { const child = without(expression.child, keys); return child ? { type: 'not', child } : undefined; }
  const children = expression.children.flatMap(child => { const next = without(child, keys); return next ? [next] : []; });
  return children.length ? { type: expression.type, children } : undefined;
}
export function createSelectionContext(query: Partial<SearchRequest> = {}): SelectionContext { return { query: searchRequestSchema.parse(query), operations: [] }; }
export function reduceSelectionContext(context: SelectionContext | undefined, operation: SelectionOperation, query: Partial<SearchRequest>): SelectionContext {
  const incoming = searchRequestSchema.parse(query); const current = context?.query ?? createSelectionContext().query; const keys = new Set(predicates(incoming.expression).map(p => `${p.capability}:${p.operator}`));
  let expression = incoming.expression;
  if (operation === 'remove' || operation === 'replace') { const remainder = without(current.expression, keys) ?? { type: 'and' as const, children: [] }; expression = operation === 'remove' ? remainder : and(remainder, expression); }
  else if (operation === 'exclude') expression = and(current.expression, { type: 'not', child: expression });
  else if (operation === 'broaden') expression = { type: 'or', children: [current.expression, expression] };
  else if (operation !== 'new') expression = and(current.expression, expression);
  return { query: searchRequestSchema.parse({ ...incoming, expression, ranking: incoming.ranking ?? (operation === 'new' ? undefined : current.ranking), target: incoming.target ?? (operation === 'new' ? undefined : current.target) }), operations: operation === 'new' ? ['new'] : [...(context?.operations ?? []).slice(-31), operation] };
}
