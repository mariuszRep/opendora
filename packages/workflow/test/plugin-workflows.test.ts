import { test, expect, afterEach } from "bun:test"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { WorkflowStorage, configurePluginWorkflowDirs } from "../src/storage"

afterEach(() => {
  configurePluginWorkflowDirs(async () => [])
})

function makeWorkflow(id: string) {
  return { id, name: id, nodes: [], edges: [] }
}

test("configurePluginWorkflowDirs injects workflows from plugin dir", async () => {
  const pluginDir = path.join(os.tmpdir(), "wf-plugin-" + Math.random().toString(36).slice(2))
  const wDir = path.join(pluginDir, "workflows")
  await fs.mkdir(wDir, { recursive: true })
  await fs.writeFile(path.join(wDir, "plugin-wf.json"), JSON.stringify(makeWorkflow("plugin-wf")), "utf-8")

  configurePluginWorkflowDirs(async () => [pluginDir])

  const workflows = await WorkflowStorage.list()
  const found = workflows.find((w) => w.id === "plugin-wf")
  expect(found).toBeDefined()
  expect(found?.name).toBe("plugin-wf")

  await fs.rm(pluginDir, { recursive: true, force: true })
})

test("invalid JSON in plugin workflow dir is skipped", async () => {
  const pluginDir = path.join(os.tmpdir(), "wf-plugin-invalid-" + Math.random().toString(36).slice(2))
  const wDir = path.join(pluginDir, "workflows")
  await fs.mkdir(wDir, { recursive: true })
  await fs.writeFile(path.join(wDir, "bad.json"), "not json {", "utf-8")
  await fs.writeFile(path.join(wDir, "good.json"), JSON.stringify(makeWorkflow("good-wf")), "utf-8")

  configurePluginWorkflowDirs(async () => [pluginDir])

  const workflows = await WorkflowStorage.list()
  expect(workflows.find((w) => w.id === "good-wf")).toBeDefined()
  expect(workflows.find((w) => w.id === "bad")).toBeUndefined()

  await fs.rm(pluginDir, { recursive: true, force: true })
})

test("missing workflows subdir in plugin dir does not crash", async () => {
  const pluginDir = path.join(os.tmpdir(), "wf-plugin-nodir-" + Math.random().toString(36).slice(2))
  await fs.mkdir(pluginDir, { recursive: true })

  configurePluginWorkflowDirs(async () => [pluginDir])

  const workflows = await WorkflowStorage.list()
  expect(Array.isArray(workflows)).toBe(true)

  await fs.rm(pluginDir, { recursive: true, force: true })
})

test("workflow with invalid schema in plugin dir is skipped", async () => {
  const pluginDir = path.join(os.tmpdir(), "wf-plugin-schema-" + Math.random().toString(36).slice(2))
  const wDir = path.join(pluginDir, "workflows")
  await fs.mkdir(wDir, { recursive: true })
  // Valid JSON but missing required 'name' field
  await fs.writeFile(path.join(wDir, "bad-schema.json"), JSON.stringify({ id: "bad-schema" }), "utf-8")
  await fs.writeFile(path.join(wDir, "good.json"), JSON.stringify(makeWorkflow("good-schema-wf")), "utf-8")

  configurePluginWorkflowDirs(async () => [pluginDir])

  const workflows = await WorkflowStorage.list()
  expect(workflows.find((w) => w.id === "good-schema-wf")).toBeDefined()
  expect(workflows.find((w) => w.id === "bad-schema")).toBeUndefined()

  await fs.rm(pluginDir, { recursive: true, force: true })
})
