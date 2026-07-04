import { test, expect } from "bun:test"
import { Plugin } from "../src/manifest"
import { attachSourceGroups } from "../src/source-group"

const validManifest = {
  pluginId: "test-plugin",
  name: "Test Plugin",
  version: "1.0.0",
  capabilities: [{ type: "tool" as const, name: "my-tool" }],
}

test("valid manifest parses successfully", () => {
  const result = Plugin.validate(validManifest)
  expect(result.pluginId).toBe("test-plugin")
  expect(result.capabilities).toHaveLength(1)
})

test("manifest with all optional fields parses successfully", () => {
  const result = Plugin.validate({
    ...validManifest,
    description: "A test plugin",
    author: "Test Author",
    license: "MIT",
    homepage: "https://example.com",
    configSchema: { apiKey: { type: "string" } },
    dependencies: ["other-plugin"],
  })
  expect(result.description).toBe("A test plugin")
  expect(result.dependencies).toEqual(["other-plugin"])
})

test("missing pluginId throws InvalidManifestError", () => {
  const { pluginId: _, ...rest } = validManifest
  expect(() => Plugin.validate(rest)).toThrow(Plugin.InvalidManifestError)
})

test("missing name throws InvalidManifestError", () => {
  const { name: _, ...rest } = validManifest
  expect(() => Plugin.validate(rest)).toThrow(Plugin.InvalidManifestError)
})

test("missing version throws InvalidManifestError", () => {
  const { version: _, ...rest } = validManifest
  expect(() => Plugin.validate(rest)).toThrow(Plugin.InvalidManifestError)
})

test("invalid capability type throws InvalidManifestError", () => {
  expect(() =>
    Plugin.validate({
      ...validManifest,
      capabilities: [{ type: "invalid-type", name: "x" }],
    }),
  ).toThrow(Plugin.InvalidManifestError)
})

test("attachSourceGroups fills missing sourceGroup", () => {
  const manifest = Plugin.validate(validManifest)
  const filled = attachSourceGroups(manifest)
  expect(filled.capabilities[0]!.sourceGroup).toBe("plugin:test-plugin")
})

test("attachSourceGroups preserves explicit sourceGroup", () => {
  const manifest = Plugin.validate({
    ...validManifest,
    capabilities: [{ type: "tool" as const, name: "x", sourceGroup: "core" }],
  })
  const filled = attachSourceGroups(manifest)
  expect(filled.capabilities[0]!.sourceGroup).toBe("core")
})

test("attachSourceGroups does not mutate original manifest", () => {
  const manifest = Plugin.validate(validManifest)
  const filled = attachSourceGroups(manifest)
  expect(manifest.capabilities[0]!.sourceGroup).toBeUndefined()
  expect(filled).not.toBe(manifest)
})
