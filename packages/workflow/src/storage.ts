/**
 * WorkflowStorage — single source of truth for workflow CRUD.
 * All file I/O and schema validation lives here.
 * Used by both HTTP routes and agent tool endpoints.
 */
import fs from "fs/promises"
import fsSync from "fs"
import path from "path"
import { Global } from "@projectflows/util/global"
import { Workflow } from "./schema.ts"

let _getPluginWorkflowDirs: (() => Promise<string[]>) | undefined

export function configurePluginWorkflowDirs(fn: () => Promise<string[]>): void {
  _getPluginWorkflowDirs = fn
}

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function assertValidId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid workflow id: "${id}"`)
}

export namespace WorkflowStorage {
  function resolveDir(): string {
    return path.join(Global.Path.config, "workflows")
  }

  function workflowDir(id: string): string {
    return path.join(resolveDir(), id)
  }

  function filePath(id: string): string {
    return path.join(workflowDir(id), "workflow.json")
  }

  async function ensureDir(): Promise<string> {
    const dir = resolveDir()
    await fs.mkdir(dir, { recursive: true })
    return dir
  }

  async function readWorkflowFolder(parentDir: string, id: string): Promise<Workflow | undefined> {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(parentDir, id, "workflow.json"), "utf8"))
      const parsed = Workflow.safeParse(raw)
      return parsed.success ? parsed.data : undefined
    } catch {
      return undefined
    }
  }

  export async function list(_baseDir?: string): Promise<Workflow[]> {
    const dir = await ensureDir()
    const seen = new Map<string, Workflow>()
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const workflow = await readWorkflowFolder(dir, entry.name)
      if (workflow) seen.set(workflow.id, workflow)
    }
    for (const pluginDir of await (_getPluginWorkflowDirs?.() ?? [])) {
      const wDir = path.join(pluginDir, "workflows")
      if (path.resolve(wDir) === path.resolve(dir)) continue
      const pluginEntries = await fs.readdir(wDir, { withFileTypes: true }).catch(() => [])
      for (const entry of pluginEntries) {
        if (!entry.isDirectory()) continue
        const workflow = await readWorkflowFolder(wDir, entry.name)
        if (workflow && !seen.has(workflow.id)) seen.set(workflow.id, workflow)
      }
    }
    return Array.from(seen.values())
  }

  export async function get(_baseDir: string | undefined, id: string): Promise<Workflow | null> {
    try {
      const fp = filePath(id)
      const raw = JSON.parse(await fs.readFile(fp, "utf8"))
      const parsed = Workflow.safeParse(raw)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  export async function create(_baseDir: string | undefined, data: unknown): Promise<Workflow> {
    const parsed = Workflow.safeParse(data)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      throw new Error(`Invalid workflow: ${issues}`)
    }
    const workflow = parsed.data
    assertValidId(workflow.id)
    const dir = workflowDir(workflow.id)
    if (fsSync.existsSync(dir)) {
      throw new Error(`Workflow "${workflow.id}" already exists`)
    }
    await ensureDir()
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath(workflow.id), JSON.stringify(workflow, null, 2), "utf8")
    return workflow
  }

  export async function update(_baseDir: string | undefined, id: string, data: unknown): Promise<Workflow> {
    const parsed = Workflow.safeParse(data)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      throw new Error(`Invalid workflow: ${issues}`)
    }
    const workflow = parsed.data
    if (workflow.id !== id) throw new Error(`Workflow id must match: got "${workflow.id}", expected "${id}"`)
    assertValidId(id)
    await ensureDir()
    await fs.mkdir(workflowDir(id), { recursive: true })
    await fs.writeFile(filePath(id), JSON.stringify(workflow, null, 2), "utf8")
    return workflow
  }

  export async function remove(_baseDir: string | undefined, id: string): Promise<void> {
    assertValidId(id)
    const dir = workflowDir(id)
    if (!fsSync.existsSync(dir)) throw new Error(`Workflow "${id}" not found`)
    await fs.rm(dir, { recursive: true, force: true })
  }

  /** Lists available workflow IDs, for error messages. */
  export async function availableIds(_baseDir?: string): Promise<string[]> {
    try {
      const dir = resolveDir()
      const entries = await fs.readdir(dir, { withFileTypes: true })
      return entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch {
      return []
    }
  }
}
