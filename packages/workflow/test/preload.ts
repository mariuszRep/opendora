// IMPORTANT: Set env vars BEFORE any imports from src/ directory
import os from "os"
import path from "path"
import fs from "fs/promises"
import { afterAll } from "bun:test"

const dir = path.join(os.tmpdir(), "workflow-test-" + process.pid)
await fs.mkdir(dir, { recursive: true })

const testHome = path.join(dir, "home")
await fs.mkdir(testHome, { recursive: true })
process.env["PROJECTFLOWS_TEST_HOME"] = testHome

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})
