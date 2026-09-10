import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations';
import { PhotoRepository } from './repository';
import type { SqlConnection, SqlDatabase, SqlValue } from './connection';
import { and, predicate, searchRequestSchema, type SearchExpression, type SearchPredicate } from '@seleva/core';
function structuredExpression(value: { filters?: Record<string, unknown>; exclusions?: Record<string, unknown> }): SearchExpression {
  const children: SearchExpression[] = [];
  const operators: Record<string, string> = { before: 'before', after: 'after', mediaTypes: 'in', ocrTerms: 'containsAny' };
  for (const [field, actual] of Object.entries(value.filters ?? {})) {
    if (actual === undefined) continue;
    const capability = field === 'before' || field === 'after' ? 'query.date' : field === 'ocrTerms' ? 'text.ocr' : field === 'screenshot' ? 'content.screenshot' : field === 'document' ? 'content.document' : field === 'duplicate' ? 'duplicate.exact' : field === 'similar' ? 'similarity.perceptual' : field === 'hasFaces' ? 'people.face' : field === 'minBlur' ? 'quality.visual' : 'metadata.core';
    children.push(predicate(capability, operators[field] ?? 'eq', { field, value: actual } as SearchPredicate['value']));
  }
  for (const [field, actual] of Object.entries(value.exclusions ?? { favorites: true })) {
    if (actual !== true && (!Array.isArray(actual) || actual.length === 0)) continue;
    children.push({ type: 'not', child: predicate('metadata.core', 'eq', { field, value: actual } as SearchPredicate['value']) });
  }
  return children.length ? and(...children) : { type: 'and', children: [] };
}
const queryPlanSchema = { parse: (value: { filters?: Record<string, unknown>; exclusions?: Record<string, unknown>; target?: { maxResults?: number }; ranking?: { strategy: string } }) => searchRequestSchema.parse({ expression: structuredExpression(value), target: value.target, ranking: value.ranking ? { capability: 'quality.visual', strategy: value.ranking.strategy } : undefined }) };

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

it('estimates only excess exact copies, retaining favorites and one keeper', async () => {
  for (const [id, favorite, hash] of [
    ['a', 0, 'same'],
    ['b', 0, 'same'],
    ['c', 1, 'protected'],
    ['d', 1, 'protected'],
    ['e', 0, 'protected'],
    ['f', 0, 'unique'],
  ] as const) {
    await photo(id, favorite, 100, 1000);
    await analysis(id, '');
    await db.runAsync(
      'UPDATE photo_hashes SET content_hash=? WHERE photo_id=?',
      hash,
      id,
    );
  }
  expect(await repository.getInsights()).toMatchObject({
    total: 6,
    duplicateCopies: 2,
    duplicateBytes: 2000,
  });
  await db.runAsync('UPDATE photos SET modified_at=200 WHERE id=?', 'b');
  expect(await repository.getInsights()).toMatchObject({
    pending: 1,
    duplicateCopies: 1,
    duplicateBytes: 1000,
  });
});
it('does not invent savings for unknown sizes or visual matches', async () => {
  await photo('a');
  await photo('b');
  await analysis('a', '');
  await analysis('b', '');
  await db.runAsync('UPDATE photos SET file_size=NULL');
  await db.runAsync("UPDATE photo_hashes SET perceptual_hash='visual'");
  expect(await repository.getInsights()).toMatchObject({
    unknownSizes: 2,
    duplicateBytes: 0,
    duplicateCopies: 0,
  });
});
it('persists saved selections and removes duplicate asset ids', async () => {
  await photo('a');
  await photo('b');
  const saved = await repository.saveSelection('Trip', ['a', 'a', 'b']);
  expect(saved.name).toBe('Trip');
  expect((await repository.getSelections())[0]).toMatchObject({
    id: saved.id, name: 'Trip', assetIds: ['a', 'b'],
  });
  expect(await repository.getSelection(saved.id)).toMatchObject({
    id: saved.id, name: 'Trip', assetIds: ['a', 'b'],
  });
  const firstPage = await repository.getSelectionPage(saved.id, { limit: 1 });
  expect(firstPage.assets).toHaveLength(1);
  expect(firstPage.nextCursor).toBe('1');
  expect((await repository.getSelectionPage(saved.id, { limit: 1, cursor: '1' })).assets).toHaveLength(1);
  await expect(repository.saveSelection(' ', ['a'])).rejects.toThrow('INVALID_SELECTION_NAME');
  await expect(repository.saveSelection('Empty', [])).rejects.toThrow('EMPTY_SELECTION');
});

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
  await repository.upsertAnalyses([{
    photoId: id,
    analysisVersion: 1,
    modelVersion: 'android-heuristic-2',
    analyzedAt: 100,
    ocrText: text,
    isScreenshot: true,
    blurScore: 0,
    qualityScore: 0.5,
    perceptualHash: `hash-${id}`,
    contentHash: `content-${id}`,
    capabilityResults: [
      { capabilityId: 'content.screenshot', status: 'completed' },
      { capabilityId: 'quality.visual', status: 'completed' },
      { capabilityId: 'similarity.perceptual', status: 'completed' },
      { capabilityId: 'duplicate.exact', status: 'completed' },
      { capabilityId: 'text.ocr', status: 'completed' },
    ],
  }]);
}
it('migrates idempotently and preserves data', async () => {
  await photo('a');
  await migrate(db);
  expect((await repository.getSummary()).photos).toBe(1);
  expect(sqlite.prepare('PRAGMA user_version').get()).toEqual(
      expect.objectContaining({ user_version: 7 }),
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
    'UPDATE photo_ocr_text SET ocr_text = ? WHERE photo_id = ?',
    'Slack',
    'a',
  );
  expect((await repository.query(plan, { limit: 10 })).assets).toHaveLength(0);
  await db.runAsync('DELETE FROM photos WHERE id = ?', 'a');
  expect(await db.getAllAsync('SELECT * FROM photo_ocr_index')).toHaveLength(0);
});
it('includes exact-only and visual copies in similar photos without repeating assets', async () => {
  await repository.upsertAssets(
    ['a', 'b', 'c', 'd', 'unique'].map((id, index) => ({
      id,
      mediaType: 'photo' as const,
      createdAt: index,
      width: 10,
      height: 10,
    })),
  );
  await repository.upsertAnalyses([
    { photoId: 'a', analysisVersion: 1, analyzedAt: 10, contentHash: 'exact' },
    { photoId: 'b', analysisVersion: 1, analyzedAt: 10, contentHash: 'exact' },
    {
      photoId: 'c',
      analysisVersion: 1,
      analyzedAt: 10,
      contentHash: 'other',
      perceptualHash: 'visual',
    },
    {
      photoId: 'd',
      analysisVersion: 1,
      analyzedAt: 10,
      contentHash: 'other',
      perceptualHash: 'visual',
    },
  ]);
  await repository.rebuildClusters();
  const result = await repository.query(
    queryPlanSchema.parse({
      filters: { similar: true, mediaTypes: ['photo'] },
      exclusions: { favorites: false },
    }),
    { limit: 10 },
  );
  expect(result.assets.map((asset) => asset.id)).toEqual(['d', 'c', 'b', 'a']);
  expect((await repository.getInsights()).similarPhotos).toBe(4);
  await db.runAsync("UPDATE photos SET media_type='video' WHERE id='d'");
  expect((await repository.getInsights()).similarPhotos).toBe(3);
  const excluded = await repository.query(
    queryPlanSchema.parse({
      filters: { similar: false },
      exclusions: { favorites: false },
    }),
    { limit: 10 },
  );
  expect(excluded.assets.map((asset) => asset.id)).toEqual(['unique']);
});

it('persists capability results and retries failed analyzers', async () => {
  await photo('capability-photo');
  await repository.upsertAnalyses([{
    photoId: 'capability-photo',
    analysisVersion: 1,
    modelVersion: 'android-heuristic-2',
    analyzedAt: 10,
    blurScore: 0.8,
    qualityScore: 0.2,
    brightnessScore: 0.7,
    isScreenshot: true,
    perceptualHash: 'visual-hash',
    contentHash: 'content-hash',
    ocrText: 'invoice',
    capabilityResults: [
      { capabilityId: 'quality.visual', status: 'completed' },
      { capabilityId: 'content.screenshot', status: 'completed' },
      { capabilityId: 'similarity.perceptual', status: 'completed' },
      { capabilityId: 'duplicate.exact', status: 'completed' },
      { capabilityId: 'text.ocr', status: 'completed' },
    ],
  }]);
  expect(await db.getAllAsync<{ capability_id: string; status: string; error: string | null }>(
    'SELECT capability_id,status,error FROM photo_analysis_capabilities ORDER BY capability_id',
  )).toEqual([
    { capability_id: 'content.screenshot', status: 'completed', error: null },
    { capability_id: 'duplicate.exact', status: 'completed', error: null },
    { capability_id: 'quality.visual', status: 'completed', error: null },
    { capability_id: 'similarity.perceptual', status: 'completed', error: null },
    { capability_id: 'text.ocr', status: 'completed', error: null },
  ]);
  expect(await db.getAllAsync<{ blur_score: number; is_screenshot: number; perceptual_hash: string; content_hash: string; ocr_text: string }>(
    `SELECT q.blur_score, c.is_screenshot, h.perceptual_hash, h.content_hash, o.ocr_text
     FROM photo_quality_signals q
     JOIN photo_content_signals c ON c.photo_id=q.photo_id
     JOIN photo_hashes h ON h.photo_id=q.photo_id
     JOIN photo_ocr_text o ON o.photo_id=q.photo_id
     WHERE q.photo_id=?`,
    'capability-photo',
  )).toEqual([{
    blur_score: 0.8,
    is_screenshot: 1,
    perceptual_hash: 'visual-hash',
    content_hash: 'content-hash',
    ocr_text: 'invoice',
  }]);
  expect(await repository.getPendingAnalysisIds(['capability-photo'])).toEqual([]);
  await repository.upsertAnalyses([{
    photoId: 'capability-photo',
    analysisVersion: 1,
    modelVersion: 'android-heuristic-2',
    analyzedAt: 20,
    capabilityResults: [{ capabilityId: 'text.ocr', status: 'failed', error: 'OCR_FAILED' }],
  }]);
  expect(await repository.getPendingAnalysisIds(['capability-photo'])).toEqual(['capability-photo']);
});
it('uses the explicit degraded document capability through local OCR', async () => {
  await photo('document');
  await photo('plain');
  await repository.upsertAnalyses([
    { photoId: 'document', analysisVersion: 1, analyzedAt: 10, ocrText: 'Invoice 123' },
  ]);
  const result = await repository.query(
    queryPlanSchema.parse({ filters: { document: true } }),
    { limit: 10 },
  );
  expect(result.assets.map((asset) => asset.id)).toEqual(['document']);
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
it('ranks redundant and least-important candidates through SQL providers', async () => {
  await repository.upsertAssets([
    { id: 'kept', mediaType: 'photo', createdAt: 10, width: 10, height: 10, isFavorite: true },
    { id: 'copy-a', mediaType: 'photo', createdAt: 20, width: 10, height: 10 },
    { id: 'copy-b', mediaType: 'photo', createdAt: 30, width: 10, height: 10 },
  ]);
  await repository.upsertAnalyses([
    { photoId: 'kept', analysisVersion: 1, analyzedAt: 100, modelVersion: 'android-heuristic-2', contentHash: 'same', qualityScore: 0.9, faceCount: 1 },
    { photoId: 'copy-a', analysisVersion: 1, analyzedAt: 100, modelVersion: 'android-heuristic-2', contentHash: 'same', qualityScore: 0.2, faceCount: 0 },
    { photoId: 'copy-b', analysisVersion: 1, analyzedAt: 100, modelVersion: 'android-heuristic-2', contentHash: 'same', qualityScore: 0.3, faceCount: 0 },
  ]);
  await repository.rebuildClusters();
  const redundant = await repository.query(queryPlanSchema.parse({ ranking: { strategy: 'most-redundant' }, exclusions: { favorites: false } }), { limit: 3 });
  expect(redundant.assets).toHaveLength(3);
  const leastImportant = await repository.query(queryPlanSchema.parse({ ranking: { strategy: 'least-important' }, exclusions: { favorites: false } }), { limit: 3 });
  expect(leastImportant.assets.map((asset) => asset.id)).toEqual(['copy-a', 'copy-b', 'kept']);
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
it('preserves visual groups after deep analysis and counts overlapping exact groups once', async () => {
  for (const id of ['a', 'b', 'c']) await photo(id);
  const rows = ['a', 'b', 'c'].map((photoId) => ({
    photoId,
    analysisVersion: 1,
    modelVersion: 'android-fast-2',
    analyzedAt: Date.now(),
    perceptualHash: '0123456789abcdef',
  }));
  await repository.upsertAnalyses(rows);
  await repository.rebuildClusters();
  expect((await repository.getInsights()).similarPhotos).toBe(3);
  await repository.upsertAnalyses(
    rows.map((row) => ({
      ...row,
      modelVersion: 'android-heuristic-2',
      contentHash: row.photoId === 'c' ? 'different' : 'same',
    })),
  );
  await repository.rebuildClusters();
  const similar = await repository.query(
    queryPlanSchema.parse({
      filters: { similar: true },
      exclusions: { favorites: false },
    }),
    { limit: 10 },
  );
  expect(similar.assets.map((asset) => asset.id).sort()).toEqual([
    'a',
    'b',
    'c',
  ]);
  expect((await repository.getInsights()).similarPhotos).toBe(3);
  const exact = await db.getAllAsync<{ photo_id: string }>(
    "SELECT m.photo_id FROM photo_cluster_members m JOIN photo_clusters c ON c.id=m.cluster_id WHERE c.kind='exact' ORDER BY m.photo_id",
  );
  expect(exact.map((row) => row.photo_id)).toEqual(['a', 'b']);
});

it('invalidates old Android hashes and never groups them with the new algorithm', async () => {
  for (const id of ['android:1:p', 'android:2:p']) await photo(id);
  await repository.upsertAnalyses(
    ['android:1:p', 'android:2:p'].map((photoId, index) => ({
      photoId,
      analysisVersion: 1,
      analyzedAt: Date.now(),
      modelVersion: index === 0 ? 'android-heuristic-1' : 'android-fast-2',
      perceptualHash: '0123456789abcdef',
      capabilityResults: [
        { capabilityId: 'content.screenshot', status: 'completed' },
        { capabilityId: 'quality.visual', status: 'completed' },
        { capabilityId: 'similarity.perceptual', status: 'completed' },
      ],
    })),
  );
  expect(
    await repository.getPendingAnalysisIds(
      ['android:1:p', 'android:2:p'],
      true,
    ),
  ).toEqual(['android:1:p']);
  await repository.rebuildClusters();
  expect((await repository.getInsights()).similarPhotos).toBe(0);
});

it('groups Android visual hashes within a bounded Hamming distance', async () => {
  await photo('android:a');
  await photo('android:b');
  await repository.upsertAnalyses([
    {
      photoId: 'android:a', analysisVersion: 1, analyzedAt: Date.now(),
      modelVersion: 'android-fast-2', perceptualHash: '0123456789abcdef',
    },
    {
      photoId: 'android:b', analysisVersion: 1, analyzedAt: Date.now(),
      modelVersion: 'android-fast-2', perceptualHash: '0123456789abcdee',
    },
  ]);
  await repository.rebuildClusters();
  const result = await repository.query(queryPlanSchema.parse({
    filters: { similar: true }, exclusions: { favorites: false },
  }), { limit: 10 });
  expect(result.assets.map((asset) => asset.id).sort()).toEqual([
    'android:a', 'android:b',
  ]);
  expect((await db.getAllAsync<{ kind: string }>(
    "SELECT kind FROM photo_clusters WHERE kind='similar'",
  ))).toEqual([{ kind: 'similar' }]);
});

it('reconciles assets removed from the device after a completed scan', async () => {
  await photo('old');
  await repository.upsertAssets(
    [
      {
        id: 'new',
        mediaType: 'photo',
        createdAt: 100,
        width: 100,
        height: 100,
      },
    ],
    200,
  );
  await repository.removeAssetsNotIndexedSince(200);
  expect((await repository.getSummary()).photos).toBe(1);
  expect(
    (
      await repository.query(
        queryPlanSchema.parse({ exclusions: { favorites: false } }),
        { limit: 10 },
      )
    ).assets[0]?.id,
  ).toBe('new');
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

it('selects only new, changed and outdated analyses in a bounded batch', async () => {
  for (const id of ['cached', 'changed', 'new', 'old-version', 'old-model'])
    await photo(id, 0, 100, 1000);
  for (const id of ['cached', 'changed', 'old-version', 'old-model'])
    await analysis(id, 'saved OCR');
  await db.runAsync("UPDATE photos SET modified_at=200 WHERE id='changed'");
  await db.runAsync(
    "UPDATE photo_analysis_capabilities SET analysis_version=0 WHERE photo_id='old-version'",
  );
  await db.runAsync(
    "UPDATE photo_analysis_capabilities SET model_version='old' WHERE photo_id='old-model'",
  );
  expect(
    (
      await repository.getPendingAnalysisIds([
        'cached',
        'changed',
        'new',
        'old-version',
        'old-model',
      ])
    ).sort(),
  ).toEqual(['changed', 'new', 'old-model', 'old-version']);
  expect((await repository.getInsights()).pending).toBe(4);
  await repository.upsertAssets([
    {
      id: 'cached',
      mediaType: 'photo',
      createdAt: 100,
      width: 100,
      height: 100,
    },
  ]);
  expect(await repository.getPendingAnalysisIds(['cached'])).toEqual([]);
  const [row] = await db.getAllAsync<{ ocr_text: string }>(
    "SELECT ocr_text FROM photo_ocr_text WHERE photo_id='cached'",
  );
  expect(row?.ocr_text).toBe('saved OCR');
  await expect(
    repository.getPendingAnalysisIds(
      Array.from({ length: 201 }, (_, i) => String(i)),
    ),
  ).rejects.toThrow('INVALID_BATCH_SIZE');
});

it.each(['android', 'ios'])(
  'persists separate fast/deep cache validity for %s',
  async (platform) => {
    const id = `${platform}:1:p`;
    await photo(id);
    await repository.upsertAnalyses([
      {
        photoId: id,
        analysisVersion: 1,
        modelVersion: platform === 'ios' ? 'ios-fast-1' : 'android-fast-2',
        analyzedAt: Date.now(),
        blurScore: 0.7,
        capabilityResults: [
          { capabilityId: 'content.screenshot', status: 'completed' },
          { capabilityId: 'quality.visual', status: 'completed' },
          { capabilityId: 'similarity.perceptual', status: 'completed' },
        ],
      },
    ]);
    expect(await repository.getPendingAnalysisIds([id], true)).toEqual([]);
    expect(await repository.getPendingAnalysisIds([id])).toEqual([id]);
    await repository.upsertAnalyses([
      {
        photoId: id,
        analysisVersion: 1,
        modelVersion:
          platform === 'ios' ? 'ios-vision-1' : 'android-heuristic-2',
        analyzedAt: Date.now(),
        ocrText: 'receipt',
        capabilityResults: [
          { capabilityId: 'content.screenshot', status: 'completed' },
          { capabilityId: 'quality.visual', status: 'completed' },
          { capabilityId: 'similarity.perceptual', status: 'completed' },
          { capabilityId: 'duplicate.exact', status: 'completed' },
          { capabilityId: 'text.ocr', status: 'completed' },
        ],
      },
    ]);
    expect(await repository.getPendingAnalysisIds([id], true)).toEqual([]);
    expect(await repository.getPendingAnalysisIds([id])).toEqual([]);
    await db.runAsync(
      'UPDATE photos SET modified_at=? WHERE id=?',
      Date.now() + 1000,
      id,
    );
    expect(await repository.getPendingAnalysisIds([id], true)).toEqual([id]);
  },
);
