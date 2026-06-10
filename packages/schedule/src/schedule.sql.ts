import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const ScheduleTable = sqliteTable("schedule", {
  id: text("id").primaryKey(),
  project_id: text("project_id"),
  session_id: text("session_id"),
  agent_id: text("agent_id"),
  description: text("description"),
  workflow_id: text("workflow_id").notNull(),
  workflow_input: text("workflow_input"),
  cron_expression: text("cron_expression").notNull(),
  timezone: text("timezone"),
  is_active: integer("is_active", { mode: "boolean" }).default(true),
  time_created: integer("time_created").notNull(),
  time_updated: integer("time_updated").notNull(),
  last_executed: integer("last_executed"),
  color: text("color"),
  name: text("name"),
})
