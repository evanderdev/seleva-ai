import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations';
import { PhotoRepository } from './repository';
import type { SqlConnection, SqlDatabase, SqlValue } from './connection';
import { queryPlanSchema } from '@seleva/core';

let sqlite: DatabaseSync;
let db: SqlDatabase;
let repository: PhotoRepository;
beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:');
  const connection: SqlConnection = {
    async execAsync(sql) {
      sqlite.exec(sql);
    },
    async runAsync(sql, ...params) {
      return sqlite.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
  };
  db = {
    ...connection,
    async withExclusiveTransactionAsync(task) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        await task(connection);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  await migrate(db);
  repository = new PhotoRepository(db);
});
afterEach(() => sqlite.close());

async function photo(id: string, favorite = 0, createdAt = 100, size = 1000) {
  await db.runAsync(
    "INSERT INTO photos(id,platform_asset_id,media_type,created_at,width,height,file_size,favorite,indexed_at) VALUES(?,?,'photo',?,100,100,?,?,100)",
    id,
    id,
    createdAt,
    size,
    favorite,
  );
}
async function analysis(id: string, text: string) {
  await db.runAsync(
    'INSERT INTO photo_analysis(photo_id,ocr_text,is_screenshot,analysis_version,analyzed_at) VALUES(?,?,1,1,100)',
    id,
    text,
  );
}
it('migrates idempotently and preserves data', async () => {
  await photo('a');
  await migrate(db);
  expect((await repository.getSummary()).photos).toBe(1);
  expect(sqlite.prepare('PRAGMA user_version').get()).toEqual(
      expect.objectContaining({ user_version: 2 }),
  );
});
it('paginates tied timestamps without duplicates and excludes favorites', async () => {
  for (const id of ['a', 'b', 'c', 'd']) await photo(id);
  await photo('favorite', 1);
  const plan = queryPlanSchema.parse({});
  const first = await repository.query(plan, { limit: 2 });
  const second = await repository.query(plan, {
    limit: 2,
    cursor: first.nextCursor,
  });
  expect([...first.assets, ...second.assets].map((asset) => asset.id)).toEqual([
    'd',
    'c',
    'b',
    'a',
  ]);
  expect(second.nextCursor).toBeUndefined();
});
it('searches actual FTS and keeps it synchronized on update/delete', async () => {
  await photo('a');
  await analysis('a', 'Jira recibo PIX');
  const plan = queryPlanSchema.parse({
    filters: { ocrTerms: ['jira', 'pix'] },
  });
  expect((await repository.query(plan, { limit: 10 })).assets).toHaveLength(1);
  await db.runAsync(
    'UPDATE photo_analysis SET ocr_text = ? WHERE photo_id = ?',
    'Slack',
    'a',
  );
  expect((await repository.query(plan, { limit: 10 })).assets).toHaveLength(0);
  await db.runAsync('DELETE FROM photos WHERE id = ?', 'a');
  expect(await db.getAllAsync('SELECT * FROM photo_ocr')).toHaveLength(0);
});
it('persists native analysis and builds duplicate clusters', async () => {
  await repository.upsertAssets([
    { id: 'a', mediaType: 'photo', createdAt: 1, width: 10, height: 10 },
    { id: 'b', mediaType: 'photo', createdAt: 2, width: 10, height: 10 },
  ]);
  await repository.upsertAnalyses([
    {
      photoId: 'a',
      analysisVersion: 1,
      analyzedAt: 10,
      contentHash: 'same',
      perceptualHash: 'p1',
      ocrText: 'receipt PIX',
      blurScore: 0.8,
    },
    {
      photoId: 'b',
      analysisVersion: 1,
      analyzedAt: 10,
      contentHash: 'same',
      perceptualHash: 'p1',
      blurScore: 0.7,
    },
  ]);
  await repository.rebuildClusters();
  const duplicates = await repository.query(
    queryPlanSchema.parse({
      exclusions: { favorites: false },
      filters: { duplicate: true },
    }),
    { limit: 10 },
  );
  expect(duplicates.assets.map((item) => item.id)).toEqual(['b', 'a']);
  const ocr = await repository.query(
    queryPlanSchema.parse({
      exclusions: { favorites: false },
      filters: { ocrTerms: ['receipt'] },
    }),
    { limit: 10 },
  );
  expect(ocr.assets.map((item) => item.id)).toEqual(['a']);
  const candidates = await repository.getCleanupCandidates(
    queryPlanSchema.parse({
      exclusions: { favorites: false },
      filters: { duplicate: true, minBlur: 0.5 },
    }),
    { limit: 10 },
  );
  expect(candidates[0]).toEqual(
    expect.objectContaining({
      photoId: 'b',
      reasons: expect.arrayContaining(['duplicate', 'blurry']),
    }),
  );
});
it('binds hostile input and rejects cursor reuse with changed filters', async () => {
  await photo('a');
  await photo('b');
  const first = await repository.query(queryPlanSchema.parse({}), { limit: 1 });
  await expect(
    repository.query(queryPlanSchema.parse({ filters: { screenshot: true } }), {
      limit: 1,
      cursor: first.nextCursor,
    }),
  ).rejects.toThrow('CURSOR_QUERY_MISMATCH');
  const result = await repository.query(
    queryPlanSchema.parse({ filters: { ocrTerms: ['" OR 1=1 --'] } }),
    { limit: 1 },
  );
  expect(result.assets).toHaveLength(0);
  expect((await repository.getSummary()).photos).toBe(2);
});
it('sorts large media and persists preferences', async () => {
  await photo('small', 0, 100, 500);
  await photo('large', 0, 100, 5000);
  const page = await repository.query(
    queryPlanSchema.parse({ ranking: { strategy: 'largest' } }),
    { limit: 1 },
  );
  expect(page.assets[0]?.id).toBe('large');
  await repository.setPreference('locale', 'pt-BR');
  await repository.setPreference('locale', 'es');
  expect(await repository.getPreference('locale')).toBe('es');
});
it('upserts native batches and persists resumable scan state', async () => {
  await repository.upsertAssets([
    {
      id: 'android:1:p',
      mediaType: 'photo',
      createdAt: 100,
      modifiedAt: 110,
      width: 120,
      height: 80,
      fileSize: 4096,
      isFavorite: true,
    },
  ]);
  await repository.upsertAssets([
    {
      id: 'android:1:p',
      mediaType: 'photo',
      createdAt: 200,
      width: 240,
      height: 160,
      fileSize: 8192,
      isFavorite: false,
    },
  ]);
  expect((await repository.getSummary()).knownBytes).toBe(8192);
  const job = await repository.createScanJob('scan-1', 1000);
  await repository.updateScanJob('scan-1', {
    processed: 1,
    total: 3,
    status: 'paused',
    checkpoint: 'all:0:1',
  });
  expect(await repository.getScanJob(job.id)).toEqual(
    expect.objectContaining({
      processed: 1,
      total: 3,
      status: 'paused',
      checkpoint: 'all:0:1',
    }),
  );
  expect(await repository.getLatestScanJob()).toEqual(
    expect.objectContaining({ id: job.id, status: 'paused' }),
  );
});
it('removes trashed assets from the local index and records cleanup history', async () => {
  await photo('a', 0, 100, 2048);
  await repository.removeAssets(['a']);
  await repository.recordCleanup(['a'], 2048, 'trashed');
  expect((await repository.getSummary()).photos).toBe(0);
  expect(
    await db.getAllAsync<{ outcome: string; recovered_bytes: number }>(
      'SELECT outcome, recovered_bytes FROM cleanup_history',
    ),
  ).toEqual([{ outcome: 'trashed', recovered_bytes: 2048 }]);
});
it('reconciles assets removed from the device after a completed scan', async () => {
  await photo('old');
  await repository.upsertAssets([
    {
      id: 'new',
      mediaType: 'photo',
      createdAt: 100,
      width: 100,
      height: 100,
    },
  ], 200);
  await repository.removeAssetsNotIndexedSince(200);
  expect((await repository.getSummary()).photos).toBe(1);
  expect((await repository.query(queryPlanSchema.parse({ exclusions: { favorites: false } }), { limit: 10 })).assets[0]?.id).toBe('new');
});
it('rejects unsupported exclusions instead of silently ignoring protection', async () => {
  await expect(
    repository.query(
      queryPlanSchema.parse({ exclusions: { importantPeople: true } }),
      { limit: 10 },
    ),
  ).rejects.toThrow('UNSUPPORTED_EXCLUSION');
});
it('enforces the total result budget across pages', async () => {
  for (const id of ['a', 'b', 'c', 'd']) await photo(id);
  const plan = queryPlanSchema.parse({ target: { maxResults: 3 } });
  const first = await repository.query(plan, { limit: 2 });
  const second = await repository.query(plan, {
    limit: 2,
    cursor: first.nextCursor,
  });
  expect(second.assets).toHaveLength(1);
  expect(second.nextCursor).toBeUndefined();
});
it('rolls back schema changes if a migration fails', async () => {
  sqlite.exec('DROP TABLE photos; PRAGMA user_version = 0;');
  await expect(migrate(db)).rejects.toThrow();
  expect(
    sqlite.prepare("SELECT name FROM sqlite_master WHERE name='photos'").all(),
  ).toHaveLength(0);
});
