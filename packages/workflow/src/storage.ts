/**
 * WorkflowStorage — single source of truth for workflow CRUD.
 * All file I/O and schema validation lives here.
 * Used by both HTTP routes and agent tool endpoints.
 */
import fs from "fs/promises"
import fsSync from "fs"
import path from "path"
import os from "os"
import { Workflow } from "./schema.ts"

export namespace WorkflowStorage {
  async function resolveDir(baseDir: string): Promise<string> {
    let dir = baseDir
    while (true) {
      const candidate = path.join(dir, ".projectflows")
      try {
        const stat = await fs.stat(candidate)
        if (stat.isDirectory()) return path.join(candidate, "workflows")
      } catch {}
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return path.join(os.homedir(), ".projectflows", "workflows")
  }

  async function filePath(baseDir: string, id: string): Promise<string> {
    return path.join(await resolveDir(baseDir), `${id}.json`)
  }

  async function ensureDir(baseDir: string): Promise<string> {
    const dir = await resolveDir(baseDir)
    await fs.mkdir(dir, { recursive: true })
    return dir
  }

  export async function list(baseDir: string): Promise<Workflow[]> {
    const dir = await ensureDir(baseDir)
    const entries = await fs.readdir(dir).catch(() => [] as string[])
    const workflows: Workflow[] = []
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      try {
        const raw = JSON.parse(await fs.readFile(path.join(dir, entry), "utf8"))
        const parsed = Workflow.safeParse(raw)
        if (parsed.success) workflows.push(parsed.data)
      } catch {}
    }
    return workflows
  }

  export async function get(baseDir: string, id: string): Promise<Workflow | null> {
    try {
      const fp = await filePath(baseDir, id)
      const raw = JSON.parse(await fs.readFile(fp, "utf8"))
      const parsed = Workflow.safeParse(raw)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  export async function create(baseDir: string, data: unknown): Promise<Workflow> {
    const parsed = Workflow.safeParse(data)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      throw new Error(`Invalid workflow: ${issues}`)
    }
    const workflow = parsed.data
    const fp = await filePath(baseDir, workflow.id)
    if (fsSync.existsSync(fp)) {
      throw new Error(`Workflow "${workflow.id}" already exists`)
    }
    await ensureDir(baseDir)
    await fs.writeFile(fp, JSON.stringify(workflow, null, 2), "utf8")
    return workflow
  }

  export async function update(baseDir: string, id: string, data: unknown): Promise<Workflow> {
    const parsed = Workflow.safeParse(data)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      throw new Error(`Invalid workflow: ${issues}`)
    }
    const workflow = parsed.data
    if (workflow.id !== id) throw new Error(`Workflow id must match: got "${workflow.id}", expected "${id}"`)
    const fp = await filePath(baseDir, id)
    await ensureDir(baseDir)
    await fs.writeFile(fp, JSON.stringify(workflow, null, 2), "utf8")
    return workflow
  }

  export async function remove(baseDir: string, id: string): Promise<void> {
    try {
      await fs.unlink(await filePath(baseDir, id))
    } catch {
      throw new Error(`Workflow "${id}" not found`)
    }
  }

  /** Lists available workflow IDs, for error messages. */
  export async function availableIds(baseDir: string): Promise<string[]> {
    try {
      const dir = await resolveDir(baseDir)
      const entries = await fs.readdir(dir)
      return entries.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
    } catch {
      return []
    }
  }
}
