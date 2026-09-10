import {
  pageRequestSchema,
  queryPlanSchema,
  type QueryPlan,
  type PageRequest,
} from '@seleva/core';
import { z } from 'zod';
import type { SqlValue } from './connection';

const cursorSchema = z.strictObject({
  value: z.number(),
  id: z.string().min(1),
  query: z.string(),
  consumed: z.number().int().nonnegative(),
});
export function buildPhotoQuery(input: QueryPlan, request: PageRequest) {
  const plan = queryPlanSchema.parse(input);
  const page = pageRequestSchema.parse(request);
  if (plan.exclusions.albums?.length || plan.exclusions.importantPeople)
    throw new Error('UNSUPPORTED_EXCLUSION');
  if (plan.filters?.people?.length || plan.filters?.places?.length || plan.filters?.sceneLabels?.length || plan.filters?.source)
    throw new Error('UNSUPPORTED_ENTITY_FILTER');
  const strategy = plan.ranking?.strategy;
  if (strategy === 'most-redundant' || strategy === 'least-important')
    throw new Error('UNSUPPORTED_RANKING');
  const sort =
    strategy === 'largest'
      ? 'COALESCE(p.file_size, -1)'
      : strategy === 'worst-quality'
        ? 'COALESCE(a.quality_score, 2)'
        : 'p.created_at';
  const direction = strategy === 'worst-quality' ? 'ASC' : 'DESC';
  const comparison = direction === 'ASC' ? '>' : '<';
  const where: string[] = [];
  const params: SqlValue[] = [];
  const add = (clause: string, value: SqlValue) => {
    where.push(clause);
    params.push(value);
  };
  const filters = plan.filters;
  if (plan.exclusions.favorites) where.push('p.favorite = 0');
  if (plan.exclusions.screenshots) where.push('COALESCE(a.is_screenshot, 0) = 0');
  for (const label of plan.exclusions.labels ?? [])
    add('NOT EXISTS (SELECT 1 FROM photo_labels l WHERE l.photo_id = p.id AND l.label = ?)', label);
  if (filters?.favorite !== undefined)
    add('p.favorite = ?', Number(filters.favorite));
  if (filters?.before !== undefined) add('p.created_at < ?', filters.before);
  if (filters?.after !== undefined) add('p.created_at > ?', filters.after);
  if (filters?.minFileSize !== undefined)
    add('p.file_size >= ?', filters.minFileSize);
  if (filters?.maxQuality !== undefined)
    add('a.quality_score <= ?', filters.maxQuality);
  if (filters?.minBlur !== undefined) add('a.blur_score >= ?', filters.minBlur);
  if (filters?.screenshot !== undefined)
    add('a.is_screenshot = ?', Number(filters.screenshot));
  if (filters?.hasFaces !== undefined)
    where.push(filters.hasFaces ? 'a.face_count > 0' : 'a.face_count = 0');
  if (filters?.mediaTypes) {
    where.push(
      filters.mediaTypes.length
        ? `p.media_type IN (${filters.mediaTypes.map(() => '?').join(',')})`
        : '0',
    );
    params.push(...filters.mediaTypes);
  }
  for (const label of filters?.labels ?? [])
    add(
      'EXISTS (SELECT 1 FROM photo_labels l WHERE l.photo_id = p.id AND l.label = ?)',
      label,
    );
  if (filters?.ocrTerms?.length) {
    const match = filters.ocrTerms
      .map((term) => `"${term.replaceAll('"', '""')}"`)
      .join(' AND ');
    add(
      'p.id IN (SELECT photo_id FROM photo_ocr WHERE photo_ocr MATCH ?)',
      match,
    );
  }
  for (const kind of ['duplicate', 'similar'] as const) {
    const enabled = filters?.[kind];
    if (enabled === undefined) continue;
    const condition =
      kind === 'duplicate'
        ? "c.kind IN ('exact','visual')"
        : "c.kind IN ('exact','similar','visual')";
    where.push(
      `${enabled ? '' : 'NOT '}EXISTS (SELECT 1 FROM photo_cluster_members m JOIN photo_clusters c ON c.id = m.cluster_id WHERE m.photo_id = p.id AND ${condition} AND (SELECT COUNT(*) FROM photo_cluster_members other WHERE other.cluster_id = c.id) > 1)`,
    );
  }
  const fingerprint = JSON.stringify(plan);
  let consumed = 0;
  if (page.cursor) {
    const cursor = cursorSchema.parse(JSON.parse(page.cursor));
    if (cursor.query !== fingerprint) throw new Error('CURSOR_QUERY_MISMATCH');
    consumed = cursor.consumed;
    where.push(
      `(${sort} ${comparison} ? OR (${sort} = ? AND p.id ${comparison} ?))`,
    );
    params.push(cursor.value, cursor.value, cursor.id);
  }
  const remaining =
    plan.target?.maxResults === undefined
      ? page.limit
      : Math.max(0, plan.target.maxResults - consumed);
  const limit = Math.min(page.limit, remaining);
  params.push(limit + 1);
  return {
    sql: `SELECT p.*, ${sort} AS sort_value FROM photos p LEFT JOIN photo_analysis a ON a.photo_id = p.id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort} ${direction}, p.id ${direction} LIMIT ?`,
    params,
    limit,
    fingerprint,
    consumed,
    remaining,
  };
}
