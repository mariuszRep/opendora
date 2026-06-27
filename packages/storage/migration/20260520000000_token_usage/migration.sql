-- Create token_usage table for per-LLM-call token and rate-limit tracking.
-- Uses soft references (no FK) so rows survive session/agent/project deletion.
CREATE TABLE IF NOT EXISTS token_usage (
  id                     TEXT    PRIMARY KEY,
  time                   INTEGER NOT NULL,

  session_id             TEXT,
  agent_id               TEXT,
  project_id             TEXT,

  provider_id            TEXT    NOT NULL,
  model_id               TEXT    NOT NULL,

  purpose                TEXT    NOT NULL DEFAULT 'chat',

  input_tokens           INTEGER NOT NULL DEFAULT 0,
  output_tokens          INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens     INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens       INTEGER NOT NULL DEFAULT 0,

  cost_usd               REAL,
  estimated_cost_usd     REAL,
  is_free                INTEGER NOT NULL DEFAULT 0,

  rl_requests_limit      INTEGER,
  rl_requests_used       INTEGER,
  rl_requests_remaining  INTEGER,
  rl_requests_reset_at   INTEGER,
  rl_tokens_limit        INTEGER,
  rl_tokens_used         INTEGER,
  rl_tokens_remaining    INTEGER,
  rl_tokens_reset_at     INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS token_usage_provider_model_time_idx ON token_usage(provider_id, model_id, time);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS token_usage_session_idx             ON token_usage(session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS token_usage_agent_time_idx          ON token_usage(agent_id, time);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS token_usage_project_time_idx        ON token_usage(project_id, time)
