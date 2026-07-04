import { test, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { MCP } from "../../src/mcp"

test("listPresets returns preset from valid mcp/*.json file", async () => {
  const pluginDir = path.join(os.tmpdir(), "mcp-preset-" + Math.random().toString(36).slice(2))
  const mcpDir = path.join(pluginDir, "mcp")
  await fs.mkdir(mcpDir, { recursive: true })
  await fs.writeFile(
    path.join(mcpDir, "my-server.json"),
    JSON.stringify({ type: "stdio", command: "my-mcp-server", args: ["--flag"] }),
    "utf-8",
  )

  const presets = await MCP.listPresets([pluginDir])
  expect(presets["my-server"]).toBeDefined()
  expect((presets["my-server"] as any).type).toBe("stdio")
  expect((presets["my-server"] as any).command).toBe("my-mcp-server")

  await fs.rm(pluginDir, { recursive: true, force: true })
})

test("non-JSON file in mcp/ dir is skipped", async () => {
  const pluginDir = path.join(os.tmpdir(), "mcp-nojson-" + Math.random().toString(36).slice(2))
  const mcpDir = path.join(pluginDir, "mcp")
  await fs.mkdir(mcpDir, { recursive: true })
  await fs.writeFile(path.join(mcpDir, "readme.txt"), "not a preset", "utf-8")
  await fs.writeFile(
    path.join(mcpDir, "real-server.json"),
    JSON.stringify({ type: "stdio", command: "real" }),
    "utf-8",
  )

  const presets = await MCP.listPresets([pluginDir])
  expect(presets["readme"]).toBeUndefined()
  expect(presets["real-server"]).toBeDefined()

  await fs.rm(pluginDir, { recursive: true, force: true })
})

test("missing mcp/ dir returns empty result without crash", async () => {
  const pluginDir = path.join(os.tmpdir(), "mcp-nodir-" + Math.random().toString(36).slice(2))
  await fs.mkdir(pluginDir, { recursive: true })

  const presets = await MCP.listPresets([pluginDir])
  expect(Object.keys(presets)).toHaveLength(0)

  await fs.rm(pluginDir, { recursive: true, force: true })
})

test("corrupt JSON in mcp/ dir is skipped, others returned", async () => {
  const pluginDir = path.join(os.tmpdir(), "mcp-corrupt-" + Math.random().toString(36).slice(2))
  const mcpDir = path.join(pluginDir, "mcp")
  await fs.mkdir(mcpDir, { recursive: true })
  await fs.writeFile(path.join(mcpDir, "bad.json"), "{ not valid json", "utf-8")
  await fs.writeFile(
    path.join(mcpDir, "good.json"),
    JSON.stringify({ type: "stdio", command: "good-server" }),
    "utf-8",
  )

  const presets = await MCP.listPresets([pluginDir])
  expect(presets["bad"]).toBeUndefined()
  expect(presets["good"]).toBeDefined()

  await fs.rm(pluginDir, { recursive: true, force: true })
})

test("listPresets with empty dirs array returns empty result", async () => {
  const presets = await MCP.listPresets([])
  expect(Object.keys(presets)).toHaveLength(0)
})
