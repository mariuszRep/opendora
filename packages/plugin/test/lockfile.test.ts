import { test, expect, beforeEach } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { Lockfile, type LockfileEntry } from "../src/lockfile"

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), "lockfile-test-" + Math.random().toString(36).slice(2))
  await fs.mkdir(tmpDir, { recursive: true })
})

function lockfilePath() {
  return path.join(tmpDir, "plugins.lock.json")
}

function makeEntry(overrides?: Partial<LockfileEntry>): LockfileEntry {
  return {
    version: "1.0.0",
    source: "projectflows-plugins",
    scope: "global",
    installedAt: new Date().toISOString(),
    capabilities: [{ type: "tool", name: "my-tool", sourceGroup: "plugin:test-plugin" }],
    ...overrides,
  }
}

test("empty() returns empty lockfile", () => {
  const data = Lockfile.empty()
  expect(data.version).toBe(1)
  expect(data.plugins).toEqual({})
})

test("read returns empty for missing file", async () => {
  const data = await Lockfile.read(path.join(tmpDir, "nonexistent.json"))
  expect(data).toEqual(Lockfile.empty())
})

test("write then read round-trips data", async () => {
  const p = lockfilePath()
  const entry = makeEntry()
  const data = { version: 1 as const, plugins: { "test-plugin": entry } }
  await Lockfile.write(p, data)
  const read = await Lockfile.read(p)
  expect(read).toEqual(data)
})

test("write creates parent directories", async () => {
  const nested = path.join(tmpDir, "a", "b", "c", "plugins.lock.json")
  await Lockfile.write(nested, Lockfile.empty())
  const data = await Lockfile.read(nested)
  expect(data.plugins).toEqual({})
})

test("addEntry adds plugin to lockfile", async () => {
  const p = lockfilePath()
  await Lockfile.addEntry(p, "my-plugin", makeEntry())
  const data = await Lockfile.read(p)
  expect(data.plugins["my-plugin"]).toBeDefined()
})

test("addEntry overwrites existing entry", async () => {
  const p = lockfilePath()
  await Lockfile.addEntry(p, "my-plugin", makeEntry({ version: "1.0.0" }))
  await Lockfile.addEntry(p, "my-plugin", makeEntry({ version: "2.0.0" }))
  const data = await Lockfile.read(p)
  expect(data.plugins["my-plugin"]!.version).toBe("2.0.0")
})

test("removeEntry removes plugin from lockfile", async () => {
  const p = lockfilePath()
  await Lockfile.addEntry(p, "my-plugin", makeEntry())
  await Lockfile.removeEntry(p, "my-plugin")
  const data = await Lockfile.read(p)
  expect(data.plugins["my-plugin"]).toBeUndefined()
})

test("removeEntry on missing plugin is a no-op", async () => {
  const p = lockfilePath()
  await expect(Lockfile.removeEntry(p, "nonexistent")).resolves.toBeUndefined()
})

test("merge: project entries win over global", () => {
  const globalEntry = makeEntry({ version: "1.0.0", scope: "global" })
  const projectEntry = makeEntry({ version: "2.0.0", scope: "project" })
  const merged = Lockfile.merge(
    { version: 1, plugins: { "shared-plugin": globalEntry, "global-only": globalEntry } },
    { version: 1, plugins: { "shared-plugin": projectEntry } },
  )
  expect(merged.plugins["shared-plugin"]!.version).toBe("2.0.0")
  expect(merged.plugins["global-only"]).toBeDefined()
})

test("merge: empty project returns global as-is", () => {
  const globalData = { version: 1 as const, plugins: { "my-plugin": makeEntry() } }
  const merged = Lockfile.merge(globalData, Lockfile.empty())
  expect(merged.plugins).toEqual(globalData.plugins)
})
