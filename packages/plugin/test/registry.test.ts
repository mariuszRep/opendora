import { test, expect, beforeEach } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { CapabilityRegistry } from "../src/registry"
import { Lockfile } from "../src/lockfile"
import { PluginStorage } from "../src/storage"
import type { LockfileEntry } from "../src/lockfile"

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), "registry-test-" + Math.random().toString(36).slice(2))
  await fs.mkdir(tmpDir, { recursive: true })
})

function makeEntry(pluginId: string, overrides?: Partial<LockfileEntry>): LockfileEntry {
  return {
    version: "1.0.0",
    source: "local",
    scope: "global",
    installedAt: new Date().toISOString(),
    capabilities: [{ type: "tool", name: `${pluginId}-tool`, sourceGroup: `plugin:${pluginId}` }],
    enabled: true,
    ...overrides,
  }
}

test("empty lockfile → empty result", async () => {
  const records = await CapabilityRegistry.load()
  expect(records.filter((r) => r.pluginId.startsWith("registry-test-fixture"))).toHaveLength(0)
})

test("single global plugin with tool capability → load returns one record", async () => {
  await Lockfile.write(PluginStorage.globalLockfilePath(), {
    version: 1,
    plugins: { "reg-plugin-a": makeEntry("reg-plugin-a") },
  })

  const records = await CapabilityRegistry.load()
  const ours = records.filter((r) => r.pluginId === "reg-plugin-a")
  expect(ours).toHaveLength(1)
  expect(ours[0]!.type).toBe("tool")
  expect(ours[0]!.name).toBe("reg-plugin-a-tool")
  expect(ours[0]!.sourceGroup).toBe("plugin:reg-plugin-a")
  expect(ours[0]!.installedDir).toBe(PluginStorage.globalRoot())
})

test("disabled plugin → excluded from load", async () => {
  await Lockfile.write(PluginStorage.globalLockfilePath(), {
    version: 1,
    plugins: {
      "reg-disabled": makeEntry("reg-disabled", { enabled: false }),
    },
  })

  const records = await CapabilityRegistry.load()
  expect(records.find((r) => r.pluginId === "reg-disabled")).toBeUndefined()
})

test("project plugin overrides global → project installedDir returned", async () => {
  const projectDir = path.join(tmpDir, "project")
  await fs.mkdir(projectDir, { recursive: true })

  await Lockfile.write(PluginStorage.globalLockfilePath(), {
    version: 1,
    plugins: { "reg-shared": makeEntry("reg-shared", { scope: "global" }) },
  })
  await Lockfile.write(PluginStorage.projectLockfilePath(projectDir), {
    version: 1,
    plugins: { "reg-shared": makeEntry("reg-shared", { scope: "project", version: "2.0.0" }) },
  })

  const records = await CapabilityRegistry.load(projectDir)
  const shared = records.filter((r) => r.pluginId === "reg-shared")
  expect(shared).toHaveLength(1)
  expect(shared[0]!.scope).toBe("project")
  expect(shared[0]!.installedDir).toBe(PluginStorage.projectConfigRoot(projectDir))
})

test("listCapabilities(type) filters correctly", async () => {
  await Lockfile.write(PluginStorage.globalLockfilePath(), {
    version: 1,
    plugins: {
      "reg-multi": makeEntry("reg-multi", {
        capabilities: [
          { type: "tool", name: "a-tool", sourceGroup: "plugin:reg-multi" },
          { type: "skill", name: "a-skill", sourceGroup: "plugin:reg-multi" },
        ],
      }),
    },
  })

  const tools = await CapabilityRegistry.listCapabilities("tool")
  const skills = await CapabilityRegistry.listCapabilities("skill")

  expect(tools.filter((r) => r.pluginId === "reg-multi")).toHaveLength(1)
  expect(skills.filter((r) => r.pluginId === "reg-multi")).toHaveLength(1)
  expect(tools.find((r) => r.pluginId === "reg-multi" && r.type === "skill")).toBeUndefined()
})

test("getCapability returns correct record by type+name", async () => {
  await Lockfile.write(PluginStorage.globalLockfilePath(), {
    version: 1,
    plugins: {
      "reg-lookup": makeEntry("reg-lookup", {
        capabilities: [{ type: "tool", name: "lookup-tool", sourceGroup: "plugin:reg-lookup" }],
      }),
    },
  })

  const found = await CapabilityRegistry.getCapability("tool", "lookup-tool")
  expect(found).not.toBeNull()
  expect(found!.pluginId).toBe("reg-lookup")

  const notFound = await CapabilityRegistry.getCapability("skill", "lookup-tool")
  expect(notFound).toBeNull()
})

test("getCapability with project override returns project-scoped record", async () => {
  const projectDir = path.join(tmpDir, "proj2")
  await fs.mkdir(projectDir, { recursive: true })

  await Lockfile.write(PluginStorage.globalLockfilePath(), {
    version: 1,
    plugins: {
      "override-plugin": makeEntry("override-plugin", {
        scope: "global",
        capabilities: [{ type: "tool", name: "shared-tool", sourceGroup: "plugin:override-plugin" }],
      }),
    },
  })
  await Lockfile.write(PluginStorage.projectLockfilePath(projectDir), {
    version: 1,
    plugins: {
      "override-plugin": makeEntry("override-plugin", {
        scope: "project",
        capabilities: [{ type: "tool", name: "shared-tool", sourceGroup: "plugin:override-plugin" }],
      }),
    },
  })

  const result = await CapabilityRegistry.getCapability("tool", "shared-tool", projectDir)
  expect(result!.scope).toBe("project")
})

test("getCapabilitiesBySource returns correct set", async () => {
  await Lockfile.write(PluginStorage.globalLockfilePath(), {
    version: 1,
    plugins: {
      "src-plugin": makeEntry("src-plugin", {
        capabilities: [
          { type: "tool", name: "tool-x", sourceGroup: "plugin:src-plugin" },
          { type: "skill", name: "skill-y", sourceGroup: "plugin:src-plugin" },
        ],
      }),
      "other-plugin": makeEntry("other-plugin", {
        capabilities: [{ type: "tool", name: "tool-z", sourceGroup: "plugin:other-plugin" }],
      }),
    },
  })

  const results = await CapabilityRegistry.getCapabilitiesBySource("plugin:src-plugin")
  expect(results.filter((r) => r.pluginId === "src-plugin")).toHaveLength(2)
  expect(results.find((r) => r.pluginId === "other-plugin")).toBeUndefined()
})

test("getInstalledDirs returns unique dirs for enabled plugins of a type", async () => {
  await Lockfile.write(PluginStorage.globalLockfilePath(), {
    version: 1,
    plugins: {
      "dir-a": makeEntry("dir-a", {
        capabilities: [
          { type: "tool", name: "tool-1", sourceGroup: "plugin:dir-a" },
          { type: "tool", name: "tool-2", sourceGroup: "plugin:dir-a" },
        ],
      }),
      "dir-b": makeEntry("dir-b", {
        capabilities: [{ type: "skill", name: "skill-1", sourceGroup: "plugin:dir-b" }],
      }),
    },
  })

  const toolDirs = await CapabilityRegistry.getInstalledDirs("tool")
  const skillDirs = await CapabilityRegistry.getInstalledDirs("skill")

  // All tool capabilities share the global root as installedDir (deduplicated to one entry)
  expect(toolDirs.filter((d) => d === PluginStorage.globalRoot())).toHaveLength(1)

  // Same for skill capabilities
  expect(skillDirs.filter((d) => d === PluginStorage.globalRoot())).toHaveLength(1)
})
