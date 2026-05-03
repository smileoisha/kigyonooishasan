-- D1 初期スキーマ（本番・dev共通）
CREATE TABLE IF NOT EXISTS store (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge (
  id          TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id   TEXT,
  title       TEXT NOT NULL,
  body        TEXT,
  structured  TEXT,
  tags        TEXT,
  customer_id TEXT,
  parent_id   TEXT,
  sort_order  INTEGER DEFAULT 0,
  comments    TEXT DEFAULT '[]',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_id TEXT NOT NULL,
  title        TEXT,
  body         TEXT,
  tags         TEXT,
  saved_at     TEXT NOT NULL
);
