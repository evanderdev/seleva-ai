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
