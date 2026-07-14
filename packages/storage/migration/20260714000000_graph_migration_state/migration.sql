-- Tracks one-shot graph ledger backfills that cannot be represented as pure DDL.

CREATE TABLE IF NOT EXISTS graph_migration_state (
  id           TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL,
  metadata     TEXT
);
