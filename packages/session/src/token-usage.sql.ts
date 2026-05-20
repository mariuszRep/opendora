import { integer, real, sqliteTable, text, index } from "drizzle-orm/sqlite-core"

export const TokenUsageTable = sqliteTable(
  "token_usage",
  {
    id:         text("id").primaryKey(),
    time:       integer("time").notNull(),

    // Soft references — no FK, data survives session/agent deletion
    session_id: text("session_id"),
    agent_id:   text("agent_id"),
    project_id: text("project_id"),

    provider_id: text("provider_id").notNull(),
    model_id:    text("model_id").notNull(),

    purpose: text("purpose", {
      enum: ["chat", "title", "compaction", "schedule", "tool", "other"] as const,
    }).notNull().default("chat"),

    input_tokens:       integer("input_tokens").notNull().default(0),
    output_tokens:      integer("output_tokens").notNull().default(0),
    cache_read_tokens:  integer("cache_read_tokens").notNull().default(0),
    cache_write_tokens: integer("cache_write_tokens").notNull().default(0),
    reasoning_tokens:   integer("reasoning_tokens").notNull().default(0),

    cost_usd:           real("cost_usd"),
    estimated_cost_usd: real("estimated_cost_usd"),
    is_free:            integer("is_free", { mode: "boolean" }).notNull().default(false),

    // Rate limit state from response headers (nullable — not all providers send these)
    rl_requests_limit:     integer("rl_requests_limit"),
    rl_requests_used:      integer("rl_requests_used"),
    rl_requests_remaining: integer("rl_requests_remaining"),
    rl_requests_reset_at:  integer("rl_requests_reset_at"),
    rl_tokens_limit:       integer("rl_tokens_limit"),
    rl_tokens_used:        integer("rl_tokens_used"),
    rl_tokens_remaining:   integer("rl_tokens_remaining"),
    rl_tokens_reset_at:    integer("rl_tokens_reset_at"),
  },
  (table) => [
    index("token_usage_provider_model_time_idx").on(table.provider_id, table.model_id, table.time),
    index("token_usage_session_idx").on(table.session_id),
    index("token_usage_agent_time_idx").on(table.agent_id, table.time),
    index("token_usage_project_time_idx").on(table.project_id, table.time),
  ],
)
