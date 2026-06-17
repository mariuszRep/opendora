import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema-tables.sql.ts",
  out: "./migration",
  dbCredentials: {
    url: process.env.OPENCODE_DB_PATH ?? "/tmp/opendora.db",
  },
})
