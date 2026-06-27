import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "./schema.sql"
import { ProjectTable } from "./project.sql"

export const ProjectDirectoryTable = sqliteTable(
  "project_directory",
  {
    id: text().primaryKey(),
    project_id: text()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    path: text().notNull(),
    label: text(),
    ...Timestamps,
  },
  (table) => [index("project_directory_project_idx").on(table.project_id)],
)
