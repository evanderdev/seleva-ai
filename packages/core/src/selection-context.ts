import { queryPlanSchema, type QueryPlan, type SelectionContext, type SelectionOperation } from './index';

type FilterKey = keyof NonNullable<QueryPlan['filters']>;
const filterKeys: FilterKey[] = [
  'before', 'after', 'mediaTypes', 'screenshot', 'favorite', 'duplicate',
  'similar', 'hasFaces', 'labels', 'ocrTerms', 'maxQuality', 'minBlur',
  'minFileSize', 'people', 'places', 'sceneLabels', 'source',
];

function clonePlan(plan: QueryPlan): QueryPlan {
  return queryPlanSchema.parse(JSON.parse(JSON.stringify(plan)) as unknown);
}

function mergeArray(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (!a && !b) return undefined;
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

function mergeFilters(base: QueryPlan['filters'], next: QueryPlan['filters'], replace: boolean): QueryPlan['filters'] {
  const result: Record<string, unknown> = { ...(base ?? {}) };
  for (const key of filterKeys) {
    const value = next?.[key];
    if (value === undefined) continue;
    if (replace || !(key in result)) result[key] = Array.isArray(value) ? [...value] : value;
    else if (Array.isArray(value)) result[key] = mergeArray(result[key] as string[] | undefined, value);
    else if (key === 'before') result[key] = Math.min(result[key] as number, value as number);
    else if (key === 'after') result[key] = Math.max(result[key] as number, value as number);
    else result[key] = value;
  }
  return Object.keys(result).length ? result as QueryPlan['filters'] : undefined;
}

export function createSelectionContext(query?: Partial<QueryPlan>): SelectionContext {
  return { query: queryPlanSchema.parse(query ?? { exclusions: { favorites: true } }), operations: [] };
}

export function reduceSelectionContext(
  context: SelectionContext | undefined,
  operation: SelectionOperation,
  query: Partial<QueryPlan>,
): SelectionContext {
  const incoming = queryPlanSchema.parse(query);
  if (operation === 'new') return { query: incoming, operations: ['new'] };
  const current = context ? clonePlan(context.query) : createSelectionContext().query;
  const next = clonePlan(current);
  const incomingFilters = incoming.filters;
  if (operation === 'replace') next.filters = mergeFilters(undefined, incomingFilters, true);
  else if (operation === 'remove') {
    const keys = Object.keys(incomingFilters ?? {}) as FilterKey[];
    if (next.filters) for (const key of keys) delete next.filters[key];
  } else if (operation === 'exclude') {
    if (incomingFilters?.screenshot === true) next.exclusions.screenshots = true;
    if (incomingFilters?.favorite === true) next.exclusions.favorites = true;
    next.exclusions.labels = mergeArray(next.exclusions.labels, incomingFilters?.labels);
  } else if (operation === 'broaden') {
    if (incomingFilters?.before !== undefined) next.filters = { ...next.filters, before: Math.max(next.filters?.before ?? incomingFilters.before, incomingFilters.before) };
    if (incomingFilters?.after !== undefined) next.filters = { ...next.filters, after: Math.min(next.filters?.after ?? incomingFilters.after, incomingFilters.after) };
    next.filters = mergeFilters(next.filters, { ...incomingFilters, before: undefined, after: undefined }, false);
  } else {
    next.filters = mergeFilters(next.filters, incomingFilters, false);
    next.exclusions = { ...next.exclusions, ...incoming.exclusions };
  }
  return { query: queryPlanSchema.parse(next), operations: [...(context?.operations ?? []), operation] };
}
