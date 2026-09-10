import type {
  AssetPage,
  PageRequest,
  PhotoAsset,
  PhotoAnalysis,
  CleanupCandidate,
  CleanupReason,
  ScanJob,
  ScanStatus,
  QueryPlan,
  Selection,
  SelectionContext,
} from '@seleva/core';
import type { SqlDatabase } from './connection';
import { buildPhotoQuery } from './query';

interface PhotoRow {
  id: string;
  media_type: 'photo' | 'video';
  created_at: number;
  modified_at: number | null;
  width: number;
  height: number;
  duration: number | null;
  file_size: number | null;
  favorite: number;
  latitude: number | null;
  longitude: number | null;
  sort_value: number;
}
interface ScanJobRow {
  id: string;
  processed: number;
  total: number;
  status: ScanStatus;
  checkpoint: string | null;
  started_at: number;
  updated_at: number;
  error: string | null;
}
interface SelectionRow {
  id: string;
  name: string;
  query_json: string | null;
  created_at: number;
  updated_at: number;
  context_json: string | null;
}
// Full analyses satisfy fast work too. Android v2 fixes whole-image visual hashing.
function pendingForStage(fastOnly = false): string {
  const complete =
    "CASE WHEN p.id LIKE 'ios:%' THEN 'ios-vision-1' ELSE 'android-heuristic-2' END";
  const fast =
    "CASE WHEN p.id LIKE 'ios:%' THEN 'ios-fast-1' ELSE 'android-fast-2' END";
  return `(a.photo_id IS NULL OR a.analyzed_at < COALESCE(p.modified_at,0)
    OR a.analysis_version != 1 OR COALESCE(a.model_version,'') NOT IN (${complete}${fastOnly ? `,${fast}` : ''}))`;
}
const pendingAnalysis = pendingForStage();

// SQLite has no built-in bit_count. The Android visual hash is a 64-bit value
// represented by 16 hexadecimal nibbles, so compare candidate pairs with a
// bounded Hamming distance while keeping the expensive work inside SQLite.
function hammingExpression(left: string, right: string): string {
  const nibble = (source: string, position: number) =>
    `(CASE substr(${source},${position},1) WHEN '0' THEN 0 WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 3 WHEN '4' THEN 4 WHEN '5' THEN 5 WHEN '6' THEN 6 WHEN '7' THEN 7 WHEN '8' THEN 8 WHEN '9' THEN 9 WHEN 'a' THEN 10 WHEN 'b' THEN 11 WHEN 'c' THEN 12 WHEN 'd' THEN 13 WHEN 'e' THEN 14 WHEN 'f' THEN 15 ELSE 0 END)`;
  const distances: string[] = [];
  for (let position = 1; position <= 16; position += 1) {
    // SQLite does not expose XOR; derive it from OR/AND arithmetic.
    const xor = `(${nibble(left, position)} + ${nibble(right, position)} - 2 * (${nibble(left, position)} & ${nibble(right, position)}))`;
    distances.push(`(((${xor} & 1) != 0) + ((${xor} & 2) != 0) + ((${xor} & 4) != 0) + ((${xor} & 8) != 0))`);
  }
  return `(${distances.join(' + ')})`;
}

export class PhotoRepository {
  constructor(private readonly db: SqlDatabase) {}

  private toAsset(row: PhotoRow): PhotoAsset {
    return {
      id: row.id,
      mediaType: row.media_type,
      createdAt: row.created_at,
      width: row.width,
      height: row.height,
      modifiedAt: row.modified_at ?? undefined,
      duration: row.duration ?? undefined,
      fileSize: row.file_size ?? undefined,
      isFavorite: row.favorite === 1,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
    };
  }

  private async hydrateSelection(row: SelectionRow): Promise<Selection> {
    const members = await this.db.getAllAsync<{ photo_id: string }>(
      'SELECT photo_id FROM saved_selection_members WHERE selection_id=? ORDER BY photo_id', row.id,
    );
    let query: QueryPlan | undefined;
    let context: SelectionContext | undefined;
    if (row.query_json) {
      try { query = JSON.parse(row.query_json) as QueryPlan; } catch { query = undefined; }
    }
    if (row.context_json) {
      try { context = JSON.parse(row.context_json) as SelectionContext; } catch { context = undefined; }
    }
    return {
      id: row.id,
      name: row.name,
      assetIds: members.map((member) => member.photo_id),
      query,
      context,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async saveSelection(
    name: string,
    assetIds: string[],
    query?: QueryPlan,
    context?: SelectionContext,
  ): Promise<Selection> {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 120) throw new Error('INVALID_SELECTION_NAME');
    const ids = [...new Set(assetIds)].filter(Boolean);
    if (!ids.length) throw new Error('EMPTY_SELECTION');
    const now = Date.now();
    const id = `selection-${now}-${Math.random().toString(36).slice(2, 8)}`;
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(
        'INSERT INTO saved_selections(id,name,query_json,created_at,updated_at,context_json) VALUES(?,?,?,?,?,?)',
        id, cleanName, query ? JSON.stringify(query) : null, now, now, context ? JSON.stringify(context) : null,
      );
      for (const assetId of ids)
        await tx.runAsync(
          'INSERT OR IGNORE INTO saved_selection_members(selection_id,photo_id) SELECT ?,id FROM photos WHERE id=?',
          id, assetId,
        );
    });
    return { id, name: cleanName, assetIds: ids, query, context, createdAt: now, updatedAt: now };
  }

  async getSelections(): Promise<Selection[]> {
    const rows = await this.db.getAllAsync<SelectionRow>(
      'SELECT * FROM saved_selections ORDER BY updated_at DESC',
    );
    return Promise.all(rows.map((row) => this.hydrateSelection(row)));
  }

  async getSelection(id: string): Promise<Selection | undefined> {
    const [row] = await this.db.getAllAsync<SelectionRow>(
      'SELECT * FROM saved_selections WHERE id=? LIMIT 1', id,
    );
    return row ? this.hydrateSelection(row) : undefined;
  }

  async getAssetsByIds(ids: string[]): Promise<AssetPage> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) return { assets: [] };
    const rows = await this.db.getAllAsync<PhotoRow>(
      `SELECT p.*, p.created_at AS sort_value FROM photos p WHERE p.id IN (${unique.map(() => '?').join(',')}) ORDER BY p.created_at DESC, p.id DESC`,
      ...unique,
    );
    return { assets: rows.map((row) => this.toAsset(row)) };
  }

  async getSelectionPage(id: string, page: PageRequest): Promise<AssetPage> {
    const offset = page.cursor === undefined ? 0 : Number(page.cursor);
    if (!Number.isInteger(offset) || offset < 0)
      throw new Error('INVALID_CURSOR');
    const rows = await this.db.getAllAsync<PhotoRow>(
      `SELECT p.*, p.created_at AS sort_value
       FROM saved_selection_members m
       INNER JOIN photos p ON p.id = m.photo_id
       WHERE m.selection_id=?
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      id, page.limit + 1, offset,
    );
    const visible = rows.slice(0, page.limit);
    return {
      assets: visible.map((row) => this.toAsset(row)),
      nextCursor: rows.length > page.limit
        ? String(offset + page.limit)
        : undefined,
    };
  }

  async getInsights() {
    const [row] = await this.db.getAllAsync<{
      total: number;
      knownBytes: number;
      unknownSizes: number;
      pending: number;
      fastPending: number;
      screenshots: number;
      blurry: number;
      largeVideos: number;
      largeVideoBytes: number;
    }>(`SELECT COUNT(*) AS total, COALESCE(SUM(p.file_size),0) AS knownBytes,
      COALESCE(SUM(p.file_size IS NULL),0) AS unknownSizes,
      COALESCE(SUM(${pendingAnalysis}),0) AS pending,
      COALESCE(SUM(${pendingForStage(true)}),0) AS fastPending,
      COALESCE(SUM(a.is_screenshot = 1),0) AS screenshots,
      COALESCE(SUM(a.blur_score >= 0.55),0) AS blurry,
      COALESCE(SUM(p.media_type = 'video' AND p.file_size >= 524288000),0) AS largeVideos,
      COALESCE(SUM(CASE WHEN p.media_type = 'video' AND p.file_size >= 524288000 THEN p.file_size ELSE 0 END),0) AS largeVideoBytes
      FROM photos p LEFT JOIN photo_analysis a ON a.photo_id = p.id`);
    // One keeper per exact-content group, with every favorite protected. No visual
    // similarity or blur heuristic contributes to the savings estimate.
    const [duplicates] = await this.db.getAllAsync<{
      duplicateBytes: number;
      duplicateCopies: number;
    }>(`
      WITH ranked AS (
        SELECT p.file_size, p.favorite,
          ROW_NUMBER() OVER (PARTITION BY a.content_hash ORDER BY p.favorite DESC, p.id) AS position
        FROM photos p JOIN photo_analysis a ON a.photo_id = p.id
        WHERE a.content_hash IS NOT NULL AND a.content_hash != ''
          AND a.analyzed_at >= COALESCE(p.modified_at,0)
      ) SELECT COALESCE(SUM(file_size),0) AS duplicateBytes, COUNT(*) AS duplicateCopies
        FROM ranked WHERE position > 1 AND favorite = 0`);
    const [similar] = await this.db.getAllAsync<{ similarPhotos: number }>(`
      SELECT COUNT(DISTINCT p.id) AS similarPhotos
      FROM photos p JOIN photo_cluster_members m ON m.photo_id = p.id
      JOIN photo_clusters c ON c.id = m.cluster_id
      WHERE p.media_type = 'photo' AND c.kind IN ('exact','visual','similar')
        AND (SELECT COUNT(*) FROM photo_cluster_members other WHERE other.cluster_id = c.id) > 1`);
    return {
      similarPhotos: similar?.similarPhotos ?? 0,
      ...(row ?? {
        total: 0,
        knownBytes: 0,
        unknownSizes: 0,
        pending: 0,
        fastPending: 0,
        screenshots: 0,
        blurry: 0,
        largeVideos: 0,
        largeVideoBytes: 0,
      }),
      ...(duplicates ?? { duplicateBytes: 0, duplicateCopies: 0 }),
    };
  }

  async getPendingAnalysisIds(
    ids: string[],
    fastOnly = false,
  ): Promise<string[]> {
    if (!ids.length) return [];
    if (ids.length > 200) throw new Error('INVALID_BATCH_SIZE');
    const rows = await this.db.getAllAsync<{ id: string }>(
      `SELECT p.id FROM photos p LEFT JOIN photo_analysis a ON a.photo_id=p.id
       WHERE p.id IN (${ids.map(() => '?').join(',')}) AND ${pendingForStage(fastOnly)}`,
      ...ids,
    );
    return rows.map((row) => row.id);
  }

  async upsertAssets(
    assets: PhotoAsset[],
    indexedAt = Date.now(),
  ): Promise<void> {
    if (assets.length === 0) return;
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      for (const asset of assets) {
        await tx.runAsync(
          `INSERT INTO photos(
            id, platform_asset_id, media_type, created_at, modified_at,
            width, height, duration, file_size, favorite, latitude, longitude, indexed_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(platform_asset_id) DO UPDATE SET
            id=excluded.id, media_type=excluded.media_type, created_at=excluded.created_at,
            modified_at=excluded.modified_at, width=excluded.width, height=excluded.height,
            duration=excluded.duration, file_size=excluded.file_size, favorite=excluded.favorite,
            latitude=excluded.latitude, longitude=excluded.longitude, indexed_at=excluded.indexed_at`,
          asset.id,
          asset.id,
          asset.mediaType,
          asset.createdAt,
          asset.modifiedAt ?? null,
          asset.width,
          asset.height,
          asset.duration ?? null,
          asset.fileSize ?? null,
          asset.isFavorite ? 1 : 0,
          asset.latitude ?? null,
          asset.longitude ?? null,
          indexedAt,
        );
      }
    });
  }

  async upsertAnalyses(analyses: PhotoAnalysis[]): Promise<void> {
    if (analyses.length === 0) return;
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      for (const analysis of analyses) {
        await tx.runAsync(
          `INSERT INTO photo_analysis(
            photo_id, blur_score, quality_score, brightness_score, face_count,
            ocr_text, is_screenshot, is_document, is_meme, perceptual_hash,
            content_hash, analysis_version, model_version, analyzed_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(photo_id) DO UPDATE SET
            blur_score=excluded.blur_score, quality_score=excluded.quality_score,
            brightness_score=excluded.brightness_score, face_count=excluded.face_count,
            ocr_text=excluded.ocr_text, is_screenshot=excluded.is_screenshot,
            is_document=excluded.is_document, is_meme=excluded.is_meme,
            perceptual_hash=excluded.perceptual_hash, content_hash=excluded.content_hash,
            analysis_version=excluded.analysis_version, model_version=excluded.model_version,
            analyzed_at=excluded.analyzed_at`,
          analysis.photoId,
          analysis.blurScore ?? null,
          analysis.qualityScore ?? null,
          analysis.brightnessScore ?? null,
          analysis.faceCount ?? null,
          analysis.ocrText ?? null,
          analysis.isScreenshot === undefined
            ? null
            : Number(analysis.isScreenshot),
          analysis.isDocument === undefined
            ? null
            : Number(analysis.isDocument),
          analysis.isMeme === undefined ? null : Number(analysis.isMeme),
          analysis.perceptualHash ?? null,
          analysis.contentHash ?? null,
          analysis.analysisVersion,
          analysis.modelVersion ?? null,
          analysis.analyzedAt,
        );
      }
    });
  }

  async rebuildClusters(): Promise<void> {
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync('DELETE FROM photo_cluster_members');
      await tx.runAsync('DELETE FROM photo_clusters');
      // Independent groups: completing SHA-256 must never replace visual membership.
      // Keep algorithm generations separate while Android v1 rows are refreshed.
      for (const [kind, column] of [
        ['exact', 'content_hash'],
        ['visual', 'perceptual_hash'],
      ] as const) {
        const key =
          kind === 'visual'
            ? `CASE WHEN a.model_version IN ('android-fast-2','android-heuristic-2') THEN 'android-v2:' ELSE 'legacy:' END || a.${column}`
            : `a.${column}`;
        await tx.runAsync(`INSERT INTO photo_clusters(id,kind,representative_id)
          SELECT 'cluster-${kind}:' || ${key}, '${kind}', MIN(a.photo_id)
          FROM photo_analysis a JOIN photos p ON p.id=a.photo_id
          WHERE a.${column} IS NOT NULL AND a.${column} != ''
            AND a.analyzed_at >= COALESCE(p.modified_at,0)
          GROUP BY ${key} HAVING COUNT(*) > 1`);
        await tx.runAsync(`INSERT INTO photo_cluster_members(cluster_id,photo_id)
          SELECT c.id,a.photo_id FROM photo_analysis a JOIN photos p ON p.id=a.photo_id
          JOIN photo_clusters c ON c.id = 'cluster-${kind}:' || ${key}
          WHERE a.analyzed_at >= COALESCE(p.modified_at,0)`);
      }
      const distance = hammingExpression('a.perceptual_hash', 'b.perceptual_hash');
      // The first four nibbles form a coarse bucket, avoiding an unbounded
      // all-against-all comparison on large libraries. Pairs are represented
      // independently; the query layer deduplicates photo IDs.
      await tx.runAsync(`INSERT INTO photo_clusters(id,kind,representative_id)
        SELECT 'cluster-similar:' || a.photo_id || ':' || b.photo_id, 'similar', a.photo_id
        FROM photo_analysis a JOIN photo_analysis b ON a.photo_id < b.photo_id
        JOIN photos pa ON pa.id=a.photo_id JOIN photos pb ON pb.id=b.photo_id
        WHERE a.perceptual_hash IS NOT NULL AND b.perceptual_hash IS NOT NULL
          AND a.perceptual_hash != '' AND b.perceptual_hash != ''
          AND substr(a.perceptual_hash,1,4) = substr(b.perceptual_hash,1,4)
          AND a.model_version IN ('android-fast-2','android-heuristic-2')
          AND b.model_version IN ('android-fast-2','android-heuristic-2')
          AND a.analyzed_at >= COALESCE(pa.modified_at,0)
          AND b.analyzed_at >= COALESCE(pb.modified_at,0)
          AND ${distance} <= 8`);
      await tx.runAsync(`INSERT INTO photo_cluster_members(cluster_id,photo_id)
        SELECT id, representative_id FROM photo_clusters WHERE kind='similar'
        UNION ALL
        SELECT c.id, b.photo_id FROM photo_clusters c
        JOIN photo_analysis a ON c.representative_id=a.photo_id
        JOIN photo_analysis b ON c.id='cluster-similar:' || a.photo_id || ':' || b.photo_id
        WHERE c.kind='similar'`);
    });
  }

  async removeAssets(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.withExclusiveTransactionAsync(async (tx) => {
      for (const id of ids)
        await tx.runAsync('DELETE FROM photos WHERE id = ?', id);
    });
  }

  async removeAssetsNotIndexedSince(indexedAt: number): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM photos WHERE indexed_at < ?',
      indexedAt,
    );
  }

  async recordCleanup(
    ids: string[],
    recoveredBytes: number,
    outcome: 'trashed' | 'cancelled' | 'failed',
  ): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO cleanup_history(id,created_at,asset_count,recovered_bytes,outcome) VALUES(?,?,?,?,?)',
      `cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      Date.now(),
      ids.length,
      recoveredBytes,
      outcome,
    );
  }

  async createScanJob(id: string, startedAt = Date.now()): Promise<ScanJob> {
    await this.db.runAsync(
      `INSERT INTO scan_jobs(id,processed,total,status,checkpoint,started_at,updated_at,error)
       VALUES(?,0,0,'running',NULL,?,?,NULL)`,
      id,
      startedAt,
      startedAt,
    );
    return {
      id,
      processed: 0,
      total: 0,
      status: 'running',
      startedAt,
      updatedAt: startedAt,
    };
  }

  async updateScanJob(
    id: string,
    update: {
      processed: number;
      total: number;
      status: ScanStatus;
      checkpoint?: string | null;
      error?: string | null;
    },
  ): Promise<void> {
    await this.db.runAsync(
      `UPDATE scan_jobs SET processed=?, total=?, status=?, checkpoint=?, updated_at=?, error=? WHERE id=?`,
      update.processed,
      update.total,
      update.status,
      update.checkpoint ?? null,
      Date.now(),
      update.error ?? null,
      id,
    );
  }

  async getScanJob(id: string): Promise<ScanJob | undefined> {
    const [row] = await this.db.getAllAsync<ScanJobRow>(
      'SELECT * FROM scan_jobs WHERE id = ?',
      id,
    );
    return this.toScanJob(row);
  }

  async getLatestScanJob(): Promise<ScanJob | undefined> {
    const [row] = await this.db.getAllAsync<ScanJobRow>(
      'SELECT * FROM scan_jobs ORDER BY updated_at DESC LIMIT 1',
    );
    return this.toScanJob(row);
  }

  private toScanJob(row: ScanJobRow | undefined): ScanJob | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      processed: row.processed,
      total: row.total,
      status: row.status,
      checkpoint: row.checkpoint ?? undefined,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      error: row.error as ScanJob['error'] | undefined,
    };
  }
  async query(plan: QueryPlan, page: PageRequest): Promise<AssetPage> {
    const query = buildPhotoQuery(plan, page);
    const rows = await this.db.getAllAsync<PhotoRow>(
      query.sql,
      ...query.params,
    );
    const hasMore =
      rows.length > query.limit &&
      (plan.target?.maxResults === undefined || query.remaining > query.limit);
    const visible = rows.slice(0, query.limit);
    const assets: PhotoAsset[] = visible.map((row) => ({
      id: row.id,
      mediaType: row.media_type,
      createdAt: row.created_at,
      width: row.width,
      height: row.height,
      modifiedAt: row.modified_at ?? undefined,
      duration: row.duration ?? undefined,
      fileSize: row.file_size ?? undefined,
      isFavorite: row.favorite === 1,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
    }));
    const last = visible.at(-1);
    return {
      assets,
      nextCursor:
        hasMore && last
          ? JSON.stringify({
              value: last.sort_value,
              id: last.id,
              query: query.fingerprint,
              consumed: query.consumed + visible.length,
            })
          : undefined,
    };
  }

  async getCleanupCandidates(
    plan: QueryPlan,
    page: PageRequest,
  ): Promise<CleanupCandidate[]> {
    const result = await this.query(plan, page);
    if (result.assets.length === 0) return [];
    const ids = result.assets.map((asset) => asset.id);
    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.db.getAllAsync<{
      id: string;
      file_size: number | null;
      is_screenshot: number | null;
      blur_score: number | null;
      created_at: number;
    }>(
      `SELECT p.id, p.file_size, p.created_at, a.is_screenshot, a.blur_score FROM photos p LEFT JOIN photo_analysis a ON a.photo_id = p.id WHERE p.id IN (${placeholders})`,
      ...ids,
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const filters = plan.filters;
    return result.assets.map((asset) => {
      const row = byId.get(asset.id);
      const reasons: CleanupReason[] = [];
      if (filters?.screenshot === true && row?.is_screenshot === 1)
        reasons.push('screenshot');
      if (filters?.duplicate === true || filters?.similar === true)
        reasons.push(filters.duplicate === true ? 'duplicate' : 'similar');
      if (
        filters?.minBlur !== undefined &&
        (row?.blur_score ?? 0) >= filters.minBlur
      )
        reasons.push('blurry');
      if (
        filters?.minFileSize !== undefined &&
        (asset.fileSize ?? 0) >= filters.minFileSize
      )
        reasons.push('large-media');
      if (filters?.before !== undefined && asset.createdAt < filters.before)
        reasons.push('old-media');
      return {
        photoId: asset.id,
        confidence: Math.min(0.99, 0.5 + reasons.length * 0.1),
        reasons,
        recoverableBytes: asset.fileSize,
      };
    });
  }
  async getSummary(): Promise<{
    photos: number;
    videos: number;
    knownBytes: number;
  }> {
    const [row] = await this.db.getAllAsync<{
      photos: number;
      videos: number;
      knownBytes: number;
    }>(
      "SELECT COALESCE(SUM(media_type = 'photo'),0) AS photos, COALESCE(SUM(media_type = 'video'),0) AS videos, COALESCE(SUM(file_size),0) AS knownBytes FROM photos",
    );
    return row ?? { photos: 0, videos: 0, knownBytes: 0 };
  }
  async getPreference(key: string): Promise<string | undefined> {
    const [row] = await this.db.getAllAsync<{ value: string }>(
      'SELECT value FROM user_preferences WHERE key = ?',
      key,
    );
    return row?.value;
  }
  async setPreference(key: string, value: string): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO user_preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      key,
      value,
    );
  }
}
