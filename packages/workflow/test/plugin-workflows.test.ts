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

async function writeWorkflowFile(wDir: string, slug: string, content: string) {
  const dir = path.join(wDir, slug)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "workflow.json"), content, "utf-8")
}

test("configurePluginWorkflowDirs injects workflows from plugin dir", async () => {
  const pluginDir = path.join(os.tmpdir(), "wf-plugin-" + Math.random().toString(36).slice(2))
  const wDir = path.join(pluginDir, "workflows")
  await writeWorkflowFile(wDir, "plugin-wf", JSON.stringify(makeWorkflow("plugin-wf")))

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
  await writeWorkflowFile(wDir, "bad", "not json {")
  await writeWorkflowFile(wDir, "good", JSON.stringify(makeWorkflow("good-wf")))

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
  // Valid JSON but missing required 'name' field
  await writeWorkflowFile(wDir, "bad-schema", JSON.stringify({ id: "bad-schema" }))
  await writeWorkflowFile(wDir, "good", JSON.stringify(makeWorkflow("good-schema-wf")))

  configurePluginWorkflowDirs(async () => [pluginDir])

  const workflows = await WorkflowStorage.list()
  expect(workflows.find((w) => w.id === "good-schema-wf")).toBeDefined()
  expect(workflows.find((w) => w.id === "bad-schema")).toBeUndefined()

  await fs.rm(pluginDir, { recursive: true, force: true })
})
