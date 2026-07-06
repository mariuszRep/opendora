import { test, expect } from "bun:test"
import {
  assertRemovable,
  PluginCoreRequiredError,
  PluginHasDependentsError,
  CORE_SOURCE_GROUPS,
} from "../src/uninstall"
import type { LockfileData, LockfileEntry } from "../src/lockfile"

function makeEntry(overrides?: Partial<LockfileEntry>): LockfileEntry {
  return {
    version: "1.0.0",
    source: "projectflows-registry",
    scope: "global",
    installedAt: new Date().toISOString(),
    capabilities: [{ type: "tool", name: "my-tool", sourceGroup: "plugin:my-plugin" }],
    ...overrides,
  }
}

test("CORE_SOURCE_GROUPS includes 'core'", () => {
  expect(CORE_SOURCE_GROUPS.has("core")).toBe(true)
})

test("plugin with core sourceGroup cannot be uninstalled", () => {
  const data: LockfileData = {
    version: 1,
    plugins: {
      "my-plugin": makeEntry({
        capabilities: [{ type: "tool", name: "bash", sourceGroup: "core" }],
      }),
    },
  }
  expect(() => assertRemovable("my-plugin", data)).toThrow(PluginCoreRequiredError)
})

test("PluginCoreRequiredError contains the plugin-id", () => {
  const data: LockfileData = {
    version: 1,
    plugins: {
      "my-plugin": makeEntry({
        capabilities: [{ type: "tool", name: "bash", sourceGroup: "core" }],
      }),
    },
  }
  try {
    assertRemovable("my-plugin", data)
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(PluginCoreRequiredError)
    expect((e as PluginCoreRequiredError).pluginId).toBe("my-plugin")
  }
})

test("plugin with a dependent cannot be uninstalled", () => {
  const data: LockfileData = {
    version: 1,
    plugins: {
      "base-plugin": makeEntry(),
      "dependent-plugin": makeEntry({ dependencies: ["base-plugin"] }),
    },
  }
  expect(() => assertRemovable("base-plugin", data)).toThrow(PluginHasDependentsError)
})

test("PluginHasDependentsError lists dependent plugin-ids", () => {
  const data: LockfileData = {
    version: 1,
    plugins: {
      "base-plugin": makeEntry(),
      "dep-a": makeEntry({ dependencies: ["base-plugin"] }),
      "dep-b": makeEntry({ dependencies: ["base-plugin"] }),
    },
  }
  try {
    assertRemovable("base-plugin", data)
    expect(true).toBe(false)
  } catch (e) {
    expect(e).toBeInstanceOf(PluginHasDependentsError)
    const err = e as PluginHasDependentsError
    expect(err.dependents).toContain("dep-a")
    expect(err.dependents).toContain("dep-b")
  }
})

test("clean plugin with no dependents can be uninstalled", () => {
  const data: LockfileData = {
    version: 1,
    plugins: { "my-plugin": makeEntry() },
  }
  expect(() => assertRemovable("my-plugin", data)).not.toThrow()
})

test("assertRemovable is a no-op for plugin not in lockfile", () => {
  expect(() => assertRemovable("nonexistent", Lockfile_empty())).not.toThrow()
})

function Lockfile_empty(): LockfileData {
  return { version: 1, plugins: {} }
}
