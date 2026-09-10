import {
  capabilityManifests,
  type AssetPage,
  type CandidateIndex,
  type CandidateSet,
  type CapabilityPlugin,
  type PageRequest,
  type SearchEngine,
  type SearchPredicate,
} from '@seleva/core';
import { pageRequestSchema } from '@seleva/core';
import { z } from 'zod';
import type { SqlDatabase, SqlValue } from './connection';

interface SqlSet extends CandidateSet { where: string; params: SqlValue[]; orderBy?: string; }
interface PhotoRow { id: string; media_type: 'photo' | 'video'; created_at: number; modified_at: number | null; width: number; height: number; duration: number | null; file_size: number | null; favorite: number; latitude: number | null; longitude: number | null; sort_value: number; }
interface PredicateValue { field?: string; value?: unknown; }
const cursorSchema = z.strictObject({ value: z.number(), id: z.string().min(1), query: z.string(), consumed: z.number().int().nonnegative() });

function valueOf(predicate: SearchPredicate): PredicateValue {
  if (typeof predicate.value !== 'object' || predicate.value === null || Array.isArray(predicate.value)) return { value: predicate.value };
  const candidate = predicate.value as Record<string, unknown>;
  return { field: typeof candidate.field === 'string' ? candidate.field : undefined, value: candidate.value };
}
function append(base: SqlSet, clause: string, params: SqlValue[]): SqlSet { return { key: `${base.key}|${clause}`, where: `(${base.where}) AND (${clause})`, params: [...base.params, ...params], orderBy: base.orderBy }; }

export class SqlCandidateIndex implements CandidateIndex {
  constructor(private readonly db: SqlDatabase) {}
  universe(): SqlSet { return { key: 'all', where: '1', params: [] }; }
  intersect(sets: CandidateSet[]): SqlSet {
    const values = sets as SqlSet[];
    return { key: values.map(set => set.key).join('&'), where: values.map(set => `(${set.where})`).join(' AND ') || '0', params: values.flatMap(set => set.params) };
  }
  union(sets: CandidateSet[]): SqlSet {
    const values = sets as SqlSet[];
    return { key: values.map(set => set.key).join('|'), where: values.map(set => `(${set.where})`).join(' OR ') || '0', params: values.flatMap(set => set.params) };
  }
  subtract(base: CandidateSet, excluded: CandidateSet): SqlSet {
    const left = base as SqlSet; const right = excluded as SqlSet;
    return { key: `${left.key}\${right.key}`, where: `(${left.where}) AND NOT (${right.where})`, params: [...left.params, ...right.params] };
  }
  apply(predicate: SearchPredicate, candidates: CandidateSet): SqlSet {
    const base = candidates as SqlSet; const { field, value } = valueOf(predicate);
    if (predicate.capability === 'query.date' && field === 'before' && typeof value === 'number') return append(base, 'p.created_at < ?', [value]);
    if (predicate.capability === 'query.date' && field === 'after' && typeof value === 'number') return append(base, 'p.created_at > ?', [value]);
    if (predicate.capability === 'metadata.core' && field === 'mediaTypes' && Array.isArray(value) && value.every(item => item === 'photo' || item === 'video')) return append(base, `p.media_type IN (${value.map(() => '?').join(',')})`, value);
    if (predicate.capability === 'metadata.core' && (field === 'favorite' || field === 'favorites') && typeof value === 'boolean') return append(base, 'p.favorite = ?', [Number(value)]);
    if (predicate.capability === 'metadata.core' && field === 'minFileSize' && typeof value === 'number') return append(base, 'p.file_size >= ?', [value]);
    if (predicate.capability === 'content.screenshot' && typeof value === 'boolean') return append(base, 'COALESCE(c.is_screenshot, a.is_screenshot, 0) = ?', [Number(value)]);
    if (predicate.capability === 'quality.visual' && field === 'maxQuality' && typeof value === 'number') return append(base, 'COALESCE(q.quality_score, a.quality_score) <= ?', [value]);
    if (predicate.capability === 'quality.visual' && field === 'minBlur' && typeof value === 'number') return append(base, 'COALESCE(q.blur_score, a.blur_score) >= ?', [value]);
    if (predicate.capability === 'quality.visual' && field === 'hasFaces' && typeof value === 'boolean') return append(base, value ? 'a.face_count > 0' : 'a.face_count = 0', []);
    if (predicate.capability === 'text.ocr' && field === 'ocrTerms' && Array.isArray(value) && value.every(item => typeof item === 'string')) {
      const match = value.map(item => `"${item.replaceAll('"', '""')}"`).join(' AND ');
      return append(base, 'p.id IN (SELECT photo_id FROM photo_ocr WHERE photo_ocr MATCH ?)', [match]);
    }
    if ((predicate.capability === 'duplicate.exact' || predicate.capability === 'similarity.perceptual') && typeof value === 'boolean') {
      const kinds = predicate.capability === 'duplicate.exact' ? "'exact','visual'" : "'exact','similar','visual'";
      const clause = `${value ? '' : 'NOT '}EXISTS (SELECT 1 FROM photo_cluster_members m JOIN photo_clusters c ON c.id = m.cluster_id WHERE m.photo_id = p.id AND c.kind IN (${kinds}) AND (SELECT COUNT(*) FROM photo_cluster_members other WHERE other.cluster_id = c.id) > 1)`;
      return append(base, clause, []);
    }
    throw new Error(`UNSUPPORTED_PREDICATE:${predicate.capability}:${predicate.operator}`);
  }
  rank(candidates: CandidateSet, strategy: string): SqlSet {
    const set = candidates as SqlSet;
    const orderBy = strategy === 'largest' ? 'COALESCE(p.file_size, -1) DESC' : strategy === 'worst-quality' ? 'COALESCE(q.quality_score, a.quality_score, 2) ASC' : undefined;
    if (!orderBy) throw new Error(`UNSUPPORTED_RANKING:${strategy}`);
    return { ...set, key: `${set.key}|rank:${strategy}`, orderBy };
  }
  async page(set: CandidateSet, request: PageRequest, fingerprint: string, maxResults?: number): Promise<AssetPage> {
    const page = pageRequestSchema.parse(request); const sqlSet = set as SqlSet; const orderBy = sqlSet.orderBy ?? 'p.created_at DESC';
    const direction = orderBy.endsWith(' ASC') ? 'ASC' : 'DESC';
    const sortExpression = orderBy.slice(0, -(direction.length + 1));
    const descending = direction !== 'ASC'; const where: string[] = [sqlSet.where]; const params = [...sqlSet.params]; let consumed = 0;
    if (page.cursor) {
      const cursor = cursorSchema.parse(JSON.parse(page.cursor));
      if (cursor.query !== fingerprint) throw new Error('CURSOR_QUERY_MISMATCH');
      consumed = cursor.consumed;
      where.push(`(${sortExpression} ${descending ? '<' : '>'} ? OR (${sortExpression} = ? AND p.id ${descending ? '<' : '>'} ?))`);
      params.push(cursor.value, cursor.value, cursor.id);
    }
    const remaining = maxResults === undefined ? page.limit : Math.max(0, maxResults - consumed); const limit = Math.min(page.limit, remaining); const fetchLimit = maxResults === undefined ? limit + 1 : Math.min(limit + 1, remaining);
    const rows = await this.db.getAllAsync<PhotoRow>(`SELECT p.*, ${sortExpression} AS sort_value FROM photos p
      LEFT JOIN photo_analysis a ON a.photo_id = p.id
      LEFT JOIN photo_quality_signals q ON q.photo_id = p.id
      LEFT JOIN photo_content_signals c ON c.photo_id = p.id
      WHERE ${where.join(' AND ')} ORDER BY ${orderBy}, p.id ${descending ? 'DESC' : 'ASC'} LIMIT ?`, ...params, fetchLimit);
    const visible = rows.slice(0, limit);
    return { assets: visible.map(row => ({ id: row.id, mediaType: row.media_type, createdAt: row.created_at, modifiedAt: row.modified_at ?? undefined, width: row.width, height: row.height, duration: row.duration ?? undefined, fileSize: row.file_size ?? undefined, isFavorite: row.favorite === 1, latitude: row.latitude ?? undefined, longitude: row.longitude ?? undefined })), nextCursor: rows.length > limit && visible.at(-1) ? JSON.stringify({ query: fingerprint, value: visible.at(-1)!.sort_value, id: visible.at(-1)!.id, consumed: consumed + visible.length }) : undefined };
  }
  release(): void { /* SQL candidate sets are immutable query descriptions. */ }
}

class SqlPredicateEngine implements SearchEngine {
  readonly version = '1';
  readonly priority = 10;
  constructor(readonly id: string, readonly capabilityId: string, private readonly index: SqlCandidateIndex) {}
  canHandle(predicate: SearchPredicate): boolean { return predicate.capability === this.capabilityId; }
  async search(predicate: SearchPredicate, _prepared: unknown, candidates: CandidateSet): Promise<CandidateSet> { return this.index.apply(predicate, candidates); }
}
class SqlRankingEngine {
  readonly id = 'sqlite.quality.ranking'; readonly capabilityId = 'quality.visual'; readonly version = '1'; readonly priority = 10;
  constructor(private readonly index: SqlCandidateIndex) {}
  canHandle(strategy: string): boolean { return strategy === 'largest' || strategy === 'worst-quality'; }
  async rank(candidates: CandidateSet, strategy: string): Promise<CandidateSet> { return this.index.rank(candidates, strategy); }
}

export function createSqlCapabilityPlugins(index: SqlCandidateIndex): CapabilityPlugin[] {
  const supported = new Set(['metadata.core', 'query.date', 'content.screenshot', 'quality.visual', 'text.ocr', 'duplicate.exact', 'similarity.perceptual']);
  return capabilityManifests.filter(manifest => supported.has(manifest.id)).map(manifest => ({
    manifest: { ...manifest, functions: [...new Set([...manifest.functions, 'search' as const])], dependencies: [...manifest.dependencies], fallbackCapabilities: [...manifest.fallbackCapabilities] },
    searchEngines: [new SqlPredicateEngine(`sqlite.${manifest.id}`, manifest.id, index)],
    ...(manifest.id === 'quality.visual' ? { rankers: [new SqlRankingEngine(index)] } : {}),
  }));
}
