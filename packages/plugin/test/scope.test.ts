import { test, expect, beforeEach } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { Lockfile, type LockfileEntry } from "../src/lockfile"
import { PluginScope } from "../src/scope"
import { PluginStorage } from "../src/storage"

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), "scope-test-" + Math.random().toString(36).slice(2))
  await fs.mkdir(tmpDir, { recursive: true })
})

function makeEntry(version: string, scope: "global" | "project"): LockfileEntry {
  return {
    version,
    source: "projectflows-registry",
    scope,
    installedAt: new Date().toISOString(),
    capabilities: [{ type: "tool", name: "my-tool", sourceGroup: "plugin:test-plugin" }],
  }
}

test("no projectDir yields empty project scope", async () => {
  const result = await PluginScope.resolve()
  expect(result.project.plugins).toEqual({})
})

test("project scope is read from projectDir lockfile", async () => {
  const projectDir = path.join(tmpDir, "project")
  await fs.mkdir(path.join(projectDir, ".projectflows", "plugins"), { recursive: true })
  const lockfile = PluginStorage.projectLockfilePath(projectDir)
  await Lockfile.write(lockfile, {
    version: 1,
    plugins: { "proj-plugin": makeEntry("1.0.0", "project") },
  })

  const result = await PluginScope.resolve(projectDir)
  expect(result.project.plugins["proj-plugin"]).toBeDefined()
})

test("effective scope merges global and project with project winning", async () => {
  const projectDir = path.join(tmpDir, "project")
  await fs.mkdir(path.join(projectDir, ".projectflows", "plugins"), { recursive: true })

  const globalLockfile = PluginStorage.globalLockfilePath()
  await Lockfile.write(globalLockfile, {
    version: 1,
    plugins: { "shared-plugin": makeEntry("1.0.0", "global") },
  })

  const projectLockfile = PluginStorage.projectLockfilePath(projectDir)
  await Lockfile.write(projectLockfile, {
    version: 1,
    plugins: { "shared-plugin": makeEntry("2.0.0", "project") },
  })

  const result = await PluginScope.resolve(projectDir)
  expect(result.effective.plugins["shared-plugin"]!.version).toBe("2.0.0")
  expect(result.effective.plugins["shared-plugin"]!.scope).toBe("project")
})
