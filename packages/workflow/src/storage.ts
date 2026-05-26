/**
 * WorkflowStorage — single source of truth for workflow CRUD.
 * All file I/O and schema validation lives here.
 * Used by both HTTP routes and agent tool endpoints.
 */
import fs from "fs/promises"
import fsSync from "fs"
import path from "path"
import { Workflow } from "./schema.ts"

export namespace WorkflowStorage {
  function dir(baseDir: string): string {
    return path.join(baseDir, ".opendora", "workflows")
  }

  function filePath(baseDir: string, id: string): string {
    return path.join(dir(baseDir), `${id}.json`)
  }

  async function ensureDir(baseDir: string): Promise<void> {
    await fs.mkdir(dir(baseDir), { recursive: true })
  }

  export async function list(baseDir: string): Promise<Workflow[]> {
    await ensureDir(baseDir)
    const entries = await fs.readdir(dir(baseDir)).catch(() => [] as string[])
    const workflows: Workflow[] = []
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      try {
        const raw = JSON.parse(await fs.readFile(path.join(dir(baseDir), entry), "utf8"))
        const parsed = Workflow.safeParse(raw)
        if (parsed.success) workflows.push(parsed.data)
      } catch {}
    }
    return workflows
  }

  export async function get(baseDir: string, id: string): Promise<Workflow | null> {
    try {
      const raw = JSON.parse(await fs.readFile(filePath(baseDir, id), "utf8"))
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
    if (fsSync.existsSync(filePath(baseDir, workflow.id))) {
      throw new Error(`Workflow "${workflow.id}" already exists`)
    }
    await ensureDir(baseDir)
    await fs.writeFile(filePath(baseDir, workflow.id), JSON.stringify(workflow, null, 2), "utf8")
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
    await ensureDir(baseDir)
    await fs.writeFile(filePath(baseDir, id), JSON.stringify(workflow, null, 2), "utf8")
    return workflow
  }

  export async function remove(baseDir: string, id: string): Promise<void> {
    try {
      await fs.unlink(filePath(baseDir, id))
    } catch {
      throw new Error(`Workflow "${id}" not found`)
    }
  }

  /** Lists available workflow IDs, for error messages. */
  export async function availableIds(baseDir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir(baseDir))
      return entries.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
    } catch {
      return []
    }
  }
}
