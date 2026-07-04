import { test, expect } from "bun:test"
import { checkConflict, PluginConflictError } from "../src/conflict"
import type { LockfileEntry } from "../src/lockfile"

function makeEntry(source: string): LockfileEntry {
  return {
    version: "1.0.0",
    source,
    scope: "global",
    installedAt: new Date().toISOString(),
    capabilities: [],
  }
}

test("no conflict when source matches", () => {
  const result = checkConflict(
    "my-plugin",
    { source: "projectflows-plugins", version: "2.0.0" },
    makeEntry("projectflows-plugins"),
    "error",
  )
  expect(result).toBeNull()
})

test("error policy throws PluginConflictError on source mismatch", () => {
  expect(() =>
    checkConflict(
      "my-plugin",
      { source: "github:org/repo", version: "1.0.0" },
      makeEntry("projectflows-plugins"),
      "error",
    ),
  ).toThrow(PluginConflictError)
})

test("error policy PluginConflictError contains plugin-id and sources", () => {
  try {
    checkConflict(
      "my-plugin",
      { source: "github:org/repo", version: "1.0.0" },
      makeEntry("projectflows-plugins"),
      "error",
    )
    expect(true).toBe(false) // should not reach
  } catch (e) {
    expect(e).toBeInstanceOf(PluginConflictError)
    const err = e as PluginConflictError
    expect(err.pluginId).toBe("my-plugin")
    expect(err.existingSource).toBe("projectflows-plugins")
    expect(err.incomingSource).toBe("github:org/repo")
  }
})

test("warn policy returns warning string on source mismatch", () => {
  const result = checkConflict(
    "my-plugin",
    { source: "github:org/repo", version: "1.0.0" },
    makeEntry("projectflows-plugins"),
    "warn",
  )
  expect(typeof result).toBe("string")
  expect(result).toContain("my-plugin")
})

test("default policy is error", () => {
  expect(() =>
    checkConflict(
      "my-plugin",
      { source: "github:org/repo", version: "1.0.0" },
      makeEntry("projectflows-plugins"),
    ),
  ).toThrow(PluginConflictError)
})
