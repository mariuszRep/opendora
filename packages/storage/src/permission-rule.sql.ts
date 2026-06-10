import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import type { Permission } from "@opendora/permission"

export const PermissionRuleTable = sqliteTable(
  "permission_rule",
  {
    id: text().primaryKey(),
    scope: text().$type<Permission.Scope>().notNull(),
    scope_id: text().notNull(),
    resource: text().notNull(),
    access: text().$type<Permission.Access>().notNull(),
    pattern: text().notNull(),
    action: text().$type<Permission.Action>().notNull(),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [index("permission_rule_scope_idx").on(table.scope, table.scope_id)],
)
