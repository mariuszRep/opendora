import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { SessionTable } from "@projectflows/session/sql"
import { Timestamps } from "./schema.sql"

export const SessionShareTable = sqliteTable("session_share", {
  session_id: text()
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  id: text().notNull(),
  secret: text().notNull(),
  url: text().notNull(),
  ...Timestamps,
})
