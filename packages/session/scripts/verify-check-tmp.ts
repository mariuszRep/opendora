import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { configure } from "@projectflows/session/config"
import { migrateAllSessions, verifyMigration } from "@projectflows/session/graph-migration"
import * as schema from "@projectflows/session/sql"

const dbPath = "/tmp/claude-1000/-mnt-fileshare-projects-opendora/cfa777a2-7387-42b7-bf90-6e353252b976/scratchpad/opendora-copy.db"
const sqlite = new Database(dbPath)
const db = drizzle({ client: sqlite, schema })
configure({ db: db as any, dataPath: "/tmp/claude-1000/-mnt-fileshare-projects-opendora/cfa777a2-7387-42b7-bf90-6e353252b976/scratchpad" })

await migrateAllSessions()
const report = verifyMigration()
console.log(JSON.stringify({ sessionsChecked: report.sessionsChecked, sessionsClean: report.sessionsClean, mismatchCount: report.mismatches.length }, null, 2))
if (report.mismatches.length > 0) {
  console.log(JSON.stringify(report.mismatches.slice(0, 5), null, 2))
}
