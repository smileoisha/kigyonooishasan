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
  category    TEXT DEFAULT 'normal',
  sort_order  INTEGER DEFAULT 0,
  comments    TEXT DEFAULT '[]',
  deleted_at  TEXT DEFAULT NULL,
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

CREATE TABLE IF NOT EXISTS protected_settings (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  password_hash     TEXT NOT NULL,
  session_ttl_min   INTEGER NOT NULL DEFAULT 30,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS protected_sessions (
  token       TEXT PRIMARY KEY,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS protected_brute (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  fail_count   INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT DEFAULT NULL
);
