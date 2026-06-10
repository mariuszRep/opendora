import { Hono } from "hono"
import { Database } from "@opendora/storage/db"
import { TokenUsageTable } from "@opendora/session/token-usage-sql"
import { gte } from "drizzle-orm"

function rangeMs(range: string): number {
  switch (range) {
    case "7d":  return 7 * 24 * 60 * 60 * 1000
    case "90d": return 90 * 24 * 60 * 60 * 1000
    case "12m": return 365 * 24 * 60 * 60 * 1000
    default:    return 30 * 24 * 60 * 60 * 1000
  }
}

export const UsageRoutes = () =>
  new Hono()
    .get("/", async (c) => {
      const range = c.req.query("range") ?? "30d"
      const db = Database.Client()
      const since = Date.now() - rangeMs(range)
      const records = db
        .select()
        .from(TokenUsageTable)
        .where(gte(TokenUsageTable.time, since))
        .orderBy(TokenUsageTable.time)
        .all()
      return c.json({ records })
    })
