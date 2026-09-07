import type {
  AssetPage,
  PageRequest,
  PhotoAsset,
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
export class PhotoRepository {
  constructor(private readonly db: SqlDatabase) {}
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
