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
// Complete v1 analyses also satisfy the fast stage. Fast-only rows never satisfy deep work.
function pendingForStage(fastOnly = false): string {
  const complete =
    "CASE WHEN p.id LIKE 'ios:%' THEN 'ios-vision-1' ELSE 'android-heuristic-1' END";
  const fast =
    "CASE WHEN p.id LIKE 'ios:%' THEN 'ios-fast-1' ELSE 'android-fast-1' END";
  return `(a.photo_id IS NULL OR a.analyzed_at < COALESCE(p.modified_at,0)
    OR a.analysis_version != 1 OR COALESCE(a.model_version,'') NOT IN (${complete}${fastOnly ? `,${fast}` : ''}))`;
}
const pendingAnalysis = pendingForStage();

export class PhotoRepository {
  constructor(private readonly db: SqlDatabase) {}

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
    return {
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
      await tx.runAsync(`INSERT INTO photo_clusters(id,kind,representative_id)
        SELECT 'cluster-' || CASE WHEN content_hash IS NOT NULL THEN 'exact:' ELSE 'visual:' END || COALESCE(content_hash,perceptual_hash),
          CASE WHEN content_hash IS NOT NULL THEN 'exact' ELSE 'visual' END, MIN(photo_id)
        FROM photo_analysis WHERE COALESCE(content_hash,perceptual_hash) IS NOT NULL
        GROUP BY CASE WHEN content_hash IS NOT NULL THEN 'exact' ELSE 'visual' END, COALESCE(content_hash,perceptual_hash) HAVING COUNT(*) > 1`);
      await tx.runAsync(`INSERT INTO photo_cluster_members(cluster_id,photo_id)
        SELECT c.id,a.photo_id FROM photo_analysis a JOIN photo_clusters c ON c.id =
          'cluster-' || CASE WHEN a.content_hash IS NOT NULL THEN 'exact:' ELSE 'visual:' END || COALESCE(a.content_hash,a.perceptual_hash)`);
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
