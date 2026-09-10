import {
  and,
  predicate,
  searchRequestSchema,
  type SearchExpression,
  type SearchPredicate,
  type SearchRequest,
} from '@seleva/core';
import type { SelevaIntent } from './types';

type QueryShape = SelevaIntent['query'];

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as SearchPredicate['value'];
}

export function filtersToExpression(
  filters: Record<string, unknown> = {},
  exclusions: Record<string, unknown> = { favorites: true },
): SearchExpression {
  const children: SearchExpression[] = [];
  const operators: Record<string, string> = {
    before: 'before', after: 'after', mediaTypes: 'in', labels: 'containsAny',
    ocrTerms: 'containsAny', people: 'containsAny', places: 'containsAny',
    sceneLabels: 'containsAny',
  };
  for (const [field, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    const capability = field === 'before' || field === 'after'
      ? 'query.date'
      : field === 'ocrTerms'
        ? 'text.ocr'
        : field === 'screenshot'
          ? 'content.screenshot'
          : field === 'document'
            ? 'content.document'
            : field === 'duplicate'
              ? 'duplicate.exact'
              : field === 'similar'
                ? 'similarity.perceptual'
                : field === 'hasFaces'
                  ? 'people.face'
                  : field === 'maxQuality' || field === 'minBlur'
                  ? 'quality.visual'
                  : 'metadata.core';
    children.push(predicate(capability, operators[field] ?? 'eq', jsonValue({ field, value })));
  }
  for (const [field, value] of Object.entries(exclusions)) {
    if (value !== true && (!Array.isArray(value) || value.length === 0)) continue;
    const capability = field === 'screenshots' ? 'content.screenshot' : field === 'labels' ? 'visual.labels' : 'metadata.core';
    children.push({
      type: 'not',
      child: predicate(capability, field === 'labels' ? 'containsAny' : 'eq', jsonValue({ field, value })),
    });
  }
  return children.length ? and(...children) : { type: 'and', children: [] };
}

export function queryToExpression(query: QueryShape): SearchExpression {
  return filtersToExpression(query.filters, query.exclusions);
}

export function queryToRequest(query: QueryShape): SearchRequest {
  return searchRequestSchema.parse({
    expression: queryToExpression(query),
    target: query.target,
    ranking: query.ranking
      ? { capability: 'quality.visual', strategy: query.ranking.strategy }
      : undefined,
  });
}
