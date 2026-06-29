-- Add typed entry-edge table for graph-backed session ledger.
-- Edges connect message entries within (or across) sessions with typed
-- directed relationships: reply, tool_call, tool_result, delegation,
-- workflow_step, retry, fork, fan_out, fan_in.
-- source_entry_id / target_entry_id are soft references (no FK) so edges
-- survive individual message deletes and support cross-session delegation.
CREATE TABLE IF NOT EXISTS entry_edge (
  id               TEXT    PRIMARY KEY,
  session_id       TEXT    NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  source_entry_id  TEXT    NOT NULL,
  target_entry_id  TEXT    NOT NULL,
  edge_type        TEXT    NOT NULL,
  display_order    INTEGER,
  metadata         TEXT,
  time_created     INTEGER NOT NULL,
  time_updated     INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS entry_edge_session_idx       ON entry_edge(session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS entry_edge_source_idx        ON entry_edge(source_entry_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS entry_edge_target_idx        ON entry_edge(target_entry_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS entry_edge_session_type_idx  ON entry_edge(session_id, edge_type)
