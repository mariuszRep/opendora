import { test, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { runWorkflowMigrationIfNeeded } from "../src/migration"

async function makeTempDir(prefix: string) {
  const dir = path.join(os.tmpdir(), prefix + Math.random().toString(36).slice(2))
  await fs.mkdir(dir, { recursive: true })
  return dir
}

test("migrates a flat workflow file with no pre-existing folder", async () => {
  const dir = await makeTempDir("wf-migrate-flat-")
  await fs.writeFile(path.join(dir, "foo.json"), JSON.stringify({ id: "foo", name: "foo" }), "utf-8")

  const migrated = runWorkflowMigrationIfNeeded(dir)
  expect(migrated).toBe(true)

  const content = await fs.readFile(path.join(dir, "foo", "workflow.json"), "utf-8")
  expect(JSON.parse(content).id).toBe("foo")
  await expect(fs.access(path.join(dir, "foo.json"))).rejects.toThrow()

  await fs.rm(dir, { recursive: true, force: true })
})

test("moves the json into an already-existing per-workflow folder", async () => {
  const dir = await makeTempDir("wf-migrate-existing-")
  await fs.mkdir(path.join(dir, "foo", "scripts"), { recursive: true })
  await fs.writeFile(path.join(dir, "foo", "scripts", "run.py"), "print('hi')", "utf-8")
  await fs.writeFile(path.join(dir, "foo.json"), JSON.stringify({ id: "foo", name: "foo" }), "utf-8")

  const migrated = runWorkflowMigrationIfNeeded(dir)
  expect(migrated).toBe(true)

  const content = await fs.readFile(path.join(dir, "foo", "workflow.json"), "utf-8")
  expect(JSON.parse(content).id).toBe("foo")
  const scriptContent = await fs.readFile(path.join(dir, "foo", "scripts", "run.py"), "utf-8")
  expect(scriptContent).toBe("print('hi')")

  await fs.rm(dir, { recursive: true, force: true })
})

test("is idempotent — a second run is a no-op", async () => {
  const dir = await makeTempDir("wf-migrate-idempotent-")
  await fs.writeFile(path.join(dir, "foo.json"), JSON.stringify({ id: "foo", name: "foo" }), "utf-8")

  expect(runWorkflowMigrationIfNeeded(dir)).toBe(true)
  expect(runWorkflowMigrationIfNeeded(dir)).toBe(false)

  await fs.rm(dir, { recursive: true, force: true })
})

test("leaves non-JSON flat files untouched", async () => {
  const dir = await makeTempDir("wf-migrate-stray-")
  await fs.writeFile(path.join(dir, "foo.json"), JSON.stringify({ id: "foo", name: "foo" }), "utf-8")
  await fs.writeFile(path.join(dir, "notes.md"), "some notes", "utf-8")

  runWorkflowMigrationIfNeeded(dir)

  const content = await fs.readFile(path.join(dir, "notes.md"), "utf-8")
  expect(content).toBe("some notes")

  await fs.rm(dir, { recursive: true, force: true })
})
