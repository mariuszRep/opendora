import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "@projectflows/runtime/instance"
import { ToolRegistry } from "@projectflows/server/tool-registry"

// Tool discovery scans dirs from ConfigPaths.directories() for files matching
// "tools/<group>/tools/*.{js,ts}" (packages/tools/registry.ts init()) — the
// grouped layout from the completed grouped-tool-install-storage-migration
// goal (.projectflows/goals/done/grouped-tool-install-storage-migration/GOAL.md:
// "no legacy flat-tool support is required after migration"). These tests
// previously wrote flat files (.opencode/tool/hello.ts, .opencode/tools/hello.ts)
// that predate that migration and were never matched by the current glob —
// confirmed via a standalone diagnostic script showing ConfigPaths.directories()
// correctly finds the project's .opencode dir, but the glob still finds nothing
// at the old flat paths. Updated to the grouped layout the scanner actually reads.

describe("tool.registry", () => {
  test("loads a custom tool from the grouped .opencode/tools/<group>/tools layout", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const groupToolsDir = path.join(dir, ".opencode", "tools", "custom", "tools")
        await fs.mkdir(groupToolsDir, { recursive: true })

        await Bun.write(
          path.join(groupToolsDir, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("hello")
      },
    })
  })

  test("loads multiple custom tools from the same grouped tools directory", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const groupToolsDir = path.join(dir, ".opencode", "tools", "custom", "tools")
        await fs.mkdir(groupToolsDir, { recursive: true })

        await Bun.write(
          path.join(groupToolsDir, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
        await Bun.write(
          path.join(groupToolsDir, "goodbye.ts"),
          [
            "export default {",
            "  description: 'goodbye tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'goodbye world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("hello")
        expect(ids).toContain("goodbye")
      },
    })
  })

  test("schemas returns sourceGroup for a discovered tool", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const groupToolsDir = path.join(dir, ".opencode", "tools", "mygroup", "tools")
        await fs.mkdir(groupToolsDir, { recursive: true })
        await Bun.write(
          path.join(groupToolsDir, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const schemas = await ToolRegistry.schemas()
        expect(schemas.length).toBeGreaterThan(0)
        for (const schema of schemas) {
          expect(schema).toHaveProperty("sourceGroup")
          expect(typeof schema.sourceGroup).toBe("string")
          expect(schema.sourceGroup.length).toBeGreaterThan(0)
        }
        const helloSchema = schemas.find((s) => s.id === "hello")
        expect(helloSchema).toBeDefined()
        expect(helloSchema?.sourceGroup).toBe("mygroup")
      },
    })
  })

  test("loads tools with external dependencies without crashing", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const opencodeDir = path.join(dir, ".opencode")
        const groupToolsDir = path.join(opencodeDir, "tools", "custom", "tools")
        await fs.mkdir(groupToolsDir, { recursive: true })

        await Bun.write(
          path.join(opencodeDir, "package.json"),
          JSON.stringify({
            name: "custom-tools",
            dependencies: {
              "@opencode-ai/plugin": "^0.0.0",
              cowsay: "^1.6.0",
            },
          }),
        )

        await Bun.write(
          path.join(groupToolsDir, "cowsay.ts"),
          [
            "import { say } from 'cowsay'",
            "export default {",
            "  description: 'tool that imports cowsay at top level',",
            "  args: { text: { type: 'string' } },",
            "  execute: async ({ text }: { text: string }) => {",
            "    return say({ text })",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Should not throw even when the tool's external dep (cowsay) isn't installed.
        // The tool file's import failure is caught and the process continues.
        const ids = await ToolRegistry.ids()
        expect(Array.isArray(ids)).toBe(true)
      },
    })
  })
})
