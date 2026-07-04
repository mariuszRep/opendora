import { test, expect, afterEach } from "bun:test"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { Agent } from "../src/agent"
import { Instance } from "../src/instance"
import { tmpdir } from "./fixture/fixture"

afterEach(() => {
  Agent.configurePluginAgentDirs(async () => [])
})

test("configurePluginAgentDirs injects plugin agents into Agent.list()", async () => {
  await using tmp = await tmpdir()

  const pluginDir = path.join(os.tmpdir(), "plugin-agent-" + Math.random().toString(36).slice(2))
  const agentDir = path.join(pluginDir, "agents", "my-plugin-agent")
  await fs.mkdir(agentDir, { recursive: true })
  await fs.writeFile(
    path.join(agentDir, "agent.json"),
    JSON.stringify({ name: "My Plugin Agent", description: "A plugin-contributed agent" }),
    "utf-8",
  )

  Agent.configurePluginAgentDirs(async () => [pluginDir])

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agents = await Agent.list()
      const names = agents.map((a) => a.name)
      expect(names).toContain("My Plugin Agent")
    },
  })

  await fs.rm(pluginDir, { recursive: true, force: true })
})

test("plugin agent dir with no agent.json is silently skipped", async () => {
  await using tmp = await tmpdir()

  const pluginDir = path.join(os.tmpdir(), "plugin-agent-nofile-" + Math.random().toString(36).slice(2))
  const badDir = path.join(pluginDir, "agents", "bad-agent")
  await fs.mkdir(badDir, { recursive: true })

  Agent.configurePluginAgentDirs(async () => [pluginDir])

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agents = await Agent.list()
      expect(agents.find((a) => a.id === "bad-agent")).toBeUndefined()
    },
  })

  await fs.rm(pluginDir, { recursive: true, force: true })
})

test("missing plugin agent dir does not crash Agent.list()", async () => {
  await using tmp = await tmpdir()

  Agent.configurePluginAgentDirs(async () => ["/nonexistent/plugin/path"])

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agents = await Agent.list()
      expect(Array.isArray(agents)).toBe(true)
    },
  })
})
