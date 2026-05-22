-- Phase 1 リレーショナルスキーマ
-- 既存テーブル（store, knowledge, customer_concerns 等）はそのまま残す
-- このファイルは本番D1に1回だけ実行する

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT,
  due_date    TEXT,
  status      TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS users (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL,
  avatar TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  sei                  TEXT,
  mei                  TEXT,
  aliases              TEXT DEFAULT '[]',
  email                TEXT,
  phone                TEXT,
  company              TEXT,
  industry             TEXT,
  business_type        TEXT,
  contract_status      TEXT,
  plan                 TEXT,
  address              TEXT,
  memo                 TEXT DEFAULT '',
  ai_profile           TEXT DEFAULT '',
  ai_profile_updated_at TEXT,
  meetings_updated_at  TEXT,
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_meetings (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL,
  date          TEXT NOT NULL,
  conclusion    TEXT DEFAULT '',
  process       TEXT DEFAULT '',
  content       TEXT DEFAULT '',
  ai_summary    TEXT DEFAULT '',
  financial_note TEXT DEFAULT '',
  action_plan   TEXT DEFAULT '',
  issues        TEXT DEFAULT '[]',
  proposals     TEXT DEFAULT '[]',
  next_actions  TEXT DEFAULT '[]',
  tags          TEXT DEFAULT '[]',
  updated_at    TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  parent_id   TEXT,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  assignee_id TEXT,
  start_date  TEXT,
  due_date    TEXT,
  memo        TEXT DEFAULT '',
  tags        TEXT DEFAULT '[]',
  children    TEXT DEFAULT '[]',
  customer_id TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_notes (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  content    TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_links (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  label      TEXT DEFAULT '',
  url        TEXT NOT NULL,
  type       TEXT,
  file_type  TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_work_logs (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id  TEXT NOT NULL,
  action   TEXT NOT NULL,
  user_id  TEXT,
  at       TEXT NOT NULL,
  reason   TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS locations (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  start_date TEXT,
  end_date   TEXT,
  color      TEXT
);

CREATE TABLE IF NOT EXISTS tag_master (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
