import { test, expect, beforeEach } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { PluginInstaller } from "../src/installer"
import { PluginStorage } from "../src/storage"
import { Lockfile } from "../src/lockfile"
import { PluginConflictError } from "../src/conflict"
import { PluginCoreRequiredError } from "../src/uninstall"
import type { Plugin } from "../src/manifest"

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), "installer-test-" + Math.random().toString(36).slice(2))
  await fs.mkdir(tmpDir, { recursive: true })
})

async function makePluginDir(pluginId: string, overrides?: Partial<Plugin.Manifest>): Promise<string> {
  const dir = path.join(tmpDir, "plugins", pluginId)
  await fs.mkdir(dir, { recursive: true })
  const manifest: Plugin.Manifest = {
    pluginId,
    name: pluginId,
    version: "1.0.0",
    capabilities: [{ type: "tool", name: "my-tool" }],
    ...overrides,
  }
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest), "utf-8")
  await fs.writeFile(path.join(dir, "index.js"), "// plugin entry", "utf-8")
  return dir
}

test("install from local path: creates installedDir and lockfile entry", async () => {
  const srcDir = await makePluginDir("test-plugin")
  await PluginInstaller.install({ sourcePath: srcDir, scope: "global" })

  const installedDir = PluginStorage.globalInstalledDir("test-plugin")
  const stat = await fs.stat(installedDir)
  expect(stat.isDirectory()).toBe(true)

  const lockfilePath = PluginStorage.globalLockfilePath()
  const data = await Lockfile.read(lockfilePath)
  expect(data.plugins["test-plugin"]).toBeDefined()
  expect(data.plugins["test-plugin"]!.version).toBe("1.0.0")
})

test("install returns PluginListItem with pluginId and enabled=true", async () => {
  const srcDir = await makePluginDir("my-plugin")
  const item = await PluginInstaller.install({ sourcePath: srcDir, scope: "global" })
  expect(item.pluginId).toBe("my-plugin")
  expect(item.enabled).toBe(true)
  expect(item.scope).toBe("global")
})

test("install extracts workflow capabilities into the global workflow directory", async () => {
  const srcDir = await makePluginDir("workflow-plugin", {
    capabilities: [{ type: "workflow", name: "catalog-workflow" }],
  })
  await fs.mkdir(path.join(srcDir, "workflows"), { recursive: true })
  await fs.writeFile(
    path.join(srcDir, "workflows", "catalog-workflow.json"),
    JSON.stringify({ id: "catalog-workflow", name: "Catalog workflow", nodes: [], edges: [] }),
    "utf-8",
  )

  await PluginInstaller.install({ sourcePath: srcDir, scope: "global" })

  const installed = path.join(PluginStorage.globalRoot(), "workflows", "catalog-workflow.json")
  expect(JSON.parse(await fs.readFile(installed, "utf-8"))).toMatchObject({ id: "catalog-workflow" })
})

test("install duplicate same source overwrites without conflict", async () => {
  const srcDir = await makePluginDir("dup-plugin")
  await PluginInstaller.install({ sourcePath: srcDir, scope: "global" })
  await expect(PluginInstaller.install({ sourcePath: srcDir, scope: "global" })).resolves.toBeDefined()
})

test("install duplicate different source with error policy throws PluginConflictError", async () => {
  const src1 = await makePluginDir("conflict-plugin")
  const src2 = path.join(tmpDir, "plugins", "conflict-plugin-alt")
  await fs.mkdir(src2, { recursive: true })
  await fs.writeFile(
    path.join(src2, "manifest.json"),
    JSON.stringify({ pluginId: "conflict-plugin", name: "conflict-plugin", version: "2.0.0", capabilities: [] }),
    "utf-8",
  )
  await PluginInstaller.install({ sourcePath: src1, scope: "global" })
  await expect(
    PluginInstaller.install({ sourcePath: src2, scope: "global", conflictPolicy: "error" }),
  ).rejects.toBeInstanceOf(PluginConflictError)
})

test("list returns installed plugins with enabled defaulting to true", async () => {
  const src = await makePluginDir("list-plugin")
  await PluginInstaller.install({ sourcePath: src, scope: "global" })
  const items = await PluginInstaller.list()
  const found = items.find((i) => i.pluginId === "list-plugin")
  expect(found).toBeDefined()
  expect(found!.enabled).toBe(true)
})

test("info returns entry for known plugin", async () => {
  const src = await makePluginDir("info-plugin")
  await PluginInstaller.install({ sourcePath: src, scope: "global" })
  const item = await PluginInstaller.info("info-plugin")
  expect(item).not.toBeNull()
  expect(item!.pluginId).toBe("info-plugin")
})

test("info returns null for unknown plugin", async () => {
  const item = await PluginInstaller.info("nonexistent-plugin-xyz")
  expect(item).toBeNull()
})

test("remove: installedDir gone and lockfile entry removed", async () => {
  const src = await makePluginDir("remove-plugin")
  await PluginInstaller.install({ sourcePath: src, scope: "global" })
  await PluginInstaller.remove("remove-plugin", { scope: "global" })

  const installedDir = PluginStorage.globalInstalledDir("remove-plugin")
  const exists = await fs.stat(installedDir).then(() => true).catch(() => false)
  expect(exists).toBe(false)

  const data = await Lockfile.read(PluginStorage.globalLockfilePath())
  expect(data.plugins["remove-plugin"]).toBeUndefined()
})

test("remove core plugin throws PluginCoreRequiredError", async () => {
  const src = await makePluginDir("core-plugin", {
    capabilities: [{ type: "tool", name: "bash", sourceGroup: "core" }],
  })
  await PluginInstaller.install({ sourcePath: src, scope: "global" })
  await expect(PluginInstaller.remove("core-plugin", { scope: "global" })).rejects.toBeInstanceOf(
    PluginCoreRequiredError,
  )
})

test("disable sets enabled=false in lockfile; installedDir still exists", async () => {
  const src = await makePluginDir("toggle-plugin")
  await PluginInstaller.install({ sourcePath: src, scope: "global" })
  await PluginInstaller.setEnabled("toggle-plugin", false, { scope: "global" })

  const data = await Lockfile.read(PluginStorage.globalLockfilePath())
  expect(data.plugins["toggle-plugin"]!.enabled).toBe(false)

  const installedDir = PluginStorage.globalInstalledDir("toggle-plugin")
  const stat = await fs.stat(installedDir)
  expect(stat.isDirectory()).toBe(true)
})

test("enable sets enabled=true after disable", async () => {
  const src = await makePluginDir("enable-plugin")
  await PluginInstaller.install({ sourcePath: src, scope: "global" })
  await PluginInstaller.setEnabled("enable-plugin", false, { scope: "global" })
  await PluginInstaller.setEnabled("enable-plugin", true, { scope: "global" })

  const data = await Lockfile.read(PluginStorage.globalLockfilePath())
  expect(data.plugins["enable-plugin"]!.enabled).toBe(true)
})
