-- Universal entries ledger and polymorphic edges table.
-- entries: immutable runtime ledger events (message, tool_call, tool_result, workflow_step, error, system_event).
-- edges:   single universal relationship table covering all persisted graph entities
--          (workflows, sessions, entries, tools, artifacts/resources) via polymorphic from/to refs.
--
-- The existing entry_edge table is NOT dropped here — it remains for the backfill migration.
-- Backfill runs at server startup via migrateAllSessions() which populates entries + edges
-- from existing MessageTable/PartTable/entry_edge rows.

CREATE TABLE IF NOT EXISTS entries (
  id           TEXT    PRIMARY KEY,
  type         TEXT    NOT NULL,
  actor        TEXT    NOT NULL,
  runner_type  TEXT    NOT NULL,
  content_text TEXT,
  payload_json TEXT,
  status       TEXT    NOT NULL,
  created_at   TEXT    NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS edges (
  id             TEXT    PRIMARY KEY,
  from_type      TEXT    NOT NULL,
  from_id        TEXT    NOT NULL,
  to_type        TEXT    NOT NULL,
  to_id          TEXT    NOT NULL,
  type           TEXT    NOT NULL,
  seq_in_parent  INTEGER,
  label          TEXT,
  metadata       TEXT,
  created_at     TEXT    NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS edges_from_idx     ON edges(from_type, from_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS edges_to_idx       ON edges(to_type, to_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS edges_type_idx     ON edges(type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS edges_contains_idx ON edges(from_type, from_id, type, seq_in_parent);
