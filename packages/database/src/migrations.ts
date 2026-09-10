import type { SqlDatabase } from './connection';

export const migrations = [
  {
    version: 1,
    sql: `
CREATE TABLE photos (
  id TEXT PRIMARY KEY NOT NULL, platform_asset_id TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK(media_type IN ('photo','video')),
  created_at INTEGER NOT NULL, modified_at INTEGER,
  width INTEGER NOT NULL CHECK(width >= 0), height INTEGER NOT NULL CHECK(height >= 0),
  duration REAL, file_size INTEGER CHECK(file_size >= 0), favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
  latitude REAL, longitude REAL, indexed_at INTEGER NOT NULL
);
CREATE INDEX photos_created ON photos(created_at DESC, id DESC);
CREATE INDEX photos_size ON photos(file_size DESC, id DESC);
CREATE TABLE photo_analysis (
  photo_id TEXT PRIMARY KEY NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  blur_score REAL CHECK(blur_score BETWEEN 0 AND 1), quality_score REAL CHECK(quality_score BETWEEN 0 AND 1),
  brightness_score REAL CHECK(brightness_score BETWEEN 0 AND 1), face_count INTEGER,
  ocr_text TEXT, is_screenshot INTEGER, is_document INTEGER, is_meme INTEGER, perceptual_hash TEXT,
  analysis_version INTEGER NOT NULL, model_version TEXT, analyzed_at INTEGER NOT NULL
);
CREATE TABLE photo_labels (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE, label TEXT NOT NULL,
  PRIMARY KEY(photo_id, label)
);
CREATE INDEX photo_labels_label ON photo_labels(label, photo_id);
CREATE TABLE photo_clusters (
  id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('exact','visual','similar')),
  representative_id TEXT REFERENCES photos(id) ON DELETE SET NULL
);
CREATE TABLE photo_cluster_members (
  cluster_id TEXT NOT NULL REFERENCES photo_clusters(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY(cluster_id, photo_id)
);
CREATE INDEX cluster_members_photo ON photo_cluster_members(photo_id);
CREATE TABLE scan_jobs (
  id TEXT PRIMARY KEY NOT NULL, processed INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending','running','paused','completed','cancelled','failed')),
  checkpoint TEXT, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, error TEXT
);
CREATE TABLE cleanup_history (
  id TEXT PRIMARY KEY NOT NULL, created_at INTEGER NOT NULL,
  asset_count INTEGER NOT NULL, recovered_bytes INTEGER, outcome TEXT NOT NULL
);
CREATE TABLE user_preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE VIRTUAL TABLE photo_ocr USING fts5(photo_id UNINDEXED, ocr_text, tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER analysis_insert AFTER INSERT ON photo_analysis BEGIN
  INSERT INTO photo_ocr(photo_id, ocr_text) VALUES(new.photo_id, COALESCE(new.ocr_text, ''));
END;
CREATE TRIGGER analysis_update AFTER UPDATE OF ocr_text ON photo_analysis BEGIN
  DELETE FROM photo_ocr WHERE photo_id = old.photo_id;
  INSERT INTO photo_ocr(photo_id, ocr_text) VALUES(new.photo_id, COALESCE(new.ocr_text, ''));
END;
CREATE TRIGGER analysis_delete AFTER DELETE ON photo_analysis BEGIN
  DELETE FROM photo_ocr WHERE photo_id = old.photo_id;
END;
`,
  },
  {
    version: 2,
    sql: `
ALTER TABLE photo_analysis ADD COLUMN content_hash TEXT;
CREATE INDEX photo_analysis_content_hash ON photo_analysis(content_hash);
`,
  },
  {
    version: 3,
    sql: `
CREATE TABLE saved_selections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  query_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE saved_selection_members (
  selection_id TEXT NOT NULL REFERENCES saved_selections(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY(selection_id, photo_id)
);
CREATE INDEX saved_selection_members_photo ON saved_selection_members(photo_id);
`,
  },
  {
    version: 4,
    sql: `ALTER TABLE saved_selections ADD COLUMN context_json TEXT;`,
  },
  {
    version: 5,
    sql: `
CREATE TABLE photo_analysis_capabilities (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed','failed')),
  analysis_version INTEGER NOT NULL,
  model_version TEXT,
  analyzed_at INTEGER NOT NULL,
  error TEXT,
  PRIMARY KEY(photo_id, capability_id)
);
CREATE INDEX photo_analysis_capabilities_status ON photo_analysis_capabilities(status, capability_id, photo_id);
`,
  },
  {
    version: 6,
    sql: `
CREATE TABLE photo_quality_signals (
  photo_id TEXT PRIMARY KEY NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  blur_score REAL CHECK(blur_score BETWEEN 0 AND 1),
  quality_score REAL CHECK(quality_score BETWEEN 0 AND 1),
  brightness_score REAL CHECK(brightness_score BETWEEN 0 AND 1),
  analysis_version INTEGER NOT NULL,
  model_version TEXT,
  analyzed_at INTEGER NOT NULL
);
CREATE TABLE photo_content_signals (
  photo_id TEXT PRIMARY KEY NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  is_screenshot INTEGER CHECK(is_screenshot IN (0,1)),
  is_document INTEGER CHECK(is_document IN (0,1)),
  is_meme INTEGER CHECK(is_meme IN (0,1)),
  analysis_version INTEGER NOT NULL,
  model_version TEXT,
  analyzed_at INTEGER NOT NULL
);
CREATE TABLE photo_hashes (
  photo_id TEXT PRIMARY KEY NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  perceptual_hash TEXT,
  content_hash TEXT,
  analysis_version INTEGER NOT NULL,
  model_version TEXT,
  analyzed_at INTEGER NOT NULL
);
CREATE TABLE photo_ocr_text (
  photo_id TEXT PRIMARY KEY NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  ocr_text TEXT NOT NULL,
  analysis_version INTEGER NOT NULL,
  model_version TEXT,
  analyzed_at INTEGER NOT NULL
);
CREATE INDEX photo_hashes_content ON photo_hashes(content_hash);
CREATE INDEX photo_hashes_perceptual ON photo_hashes(perceptual_hash);
INSERT INTO photo_quality_signals(
  photo_id, blur_score, quality_score, brightness_score,
  analysis_version, model_version, analyzed_at
)
SELECT photo_id, blur_score, quality_score, brightness_score,
  analysis_version, model_version, analyzed_at
FROM photo_analysis
WHERE blur_score IS NOT NULL OR quality_score IS NOT NULL OR brightness_score IS NOT NULL;
INSERT INTO photo_content_signals(
  photo_id, is_screenshot, is_document, is_meme,
  analysis_version, model_version, analyzed_at
)
SELECT photo_id, is_screenshot, is_document, is_meme,
  analysis_version, model_version, analyzed_at
FROM photo_analysis
WHERE is_screenshot IS NOT NULL OR is_document IS NOT NULL OR is_meme IS NOT NULL;
INSERT INTO photo_hashes(
  photo_id, perceptual_hash, content_hash,
  analysis_version, model_version, analyzed_at
)
SELECT photo_id, perceptual_hash, content_hash,
  analysis_version, model_version, analyzed_at
FROM photo_analysis
WHERE perceptual_hash IS NOT NULL OR content_hash IS NOT NULL;
INSERT INTO photo_ocr_text(
  photo_id, ocr_text, analysis_version, model_version, analyzed_at
)
SELECT photo_id, COALESCE(ocr_text, ''), analysis_version, model_version, analyzed_at
FROM photo_analysis
WHERE ocr_text IS NOT NULL;
`,
  },
  {
    version: 7,
    sql: `
DROP TRIGGER IF EXISTS analysis_insert;
DROP TRIGGER IF EXISTS analysis_update;
DROP TRIGGER IF EXISTS analysis_delete;
DROP TABLE IF EXISTS photo_ocr;
DROP TABLE IF EXISTS photo_analysis;
CREATE VIRTUAL TABLE photo_ocr_index USING fts5(
  photo_id UNINDEXED,
  ocr_text,
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER photo_ocr_text_insert AFTER INSERT ON photo_ocr_text BEGIN
  INSERT INTO photo_ocr_index(photo_id, ocr_text) VALUES(new.photo_id, new.ocr_text);
END;
CREATE TRIGGER photo_ocr_text_update AFTER UPDATE OF ocr_text ON photo_ocr_text BEGIN
  DELETE FROM photo_ocr_index WHERE photo_id = old.photo_id;
  INSERT INTO photo_ocr_index(photo_id, ocr_text) VALUES(new.photo_id, new.ocr_text);
END;
CREATE TRIGGER photo_ocr_text_delete AFTER DELETE ON photo_ocr_text BEGIN
  DELETE FROM photo_ocr_index WHERE photo_id = old.photo_id;
END;
ALTER TABLE photo_quality_signals ADD COLUMN face_count INTEGER CHECK(face_count >= 0);
INSERT INTO photo_ocr_index(photo_id, ocr_text)
  SELECT photo_id, ocr_text FROM photo_ocr_text;
`,
  },
] as const;

export async function migrate(db: SqlDatabase): Promise<void> {
  await db.execAsync(
    'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
  );
  await db.withExclusiveTransactionAsync(async (tx) => {
    const [row] = await tx.getAllAsync<{ user_version: number }>(
      'PRAGMA user_version',
    );
    const version = row?.user_version ?? 0;
    if (version > migrations.length)
      throw new Error('DATABASE_VERSION_TOO_NEW');
    for (const migration of migrations) {
      if (migration.version <= version) continue;
      await tx.execAsync(migration.sql);
      await tx.execAsync(`PRAGMA user_version = ${migration.version}`);
    }
  });
}
