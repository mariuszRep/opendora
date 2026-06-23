/**
 * WorkflowStorage — single source of truth for workflow CRUD.
 * All file I/O and schema validation lives here.
 * Used by both HTTP routes and agent tool endpoints.
 */
import fs from "fs/promises"
import fsSync from "fs"
import path from "path"
import { Global } from "@opendora/util/global"
import { Workflow } from "./schema.ts"

export namespace WorkflowStorage {
  function resolveDir(): string {
    return path.join(Global.Path.config, "workflows")
  }

  function filePath(id: string): string {
    return path.join(resolveDir(), `${id}.json`)
  }

  async function ensureDir(): Promise<string> {
    const dir = resolveDir()
    await fs.mkdir(dir, { recursive: true })
    return dir
  }

  export async function list(_baseDir?: string): Promise<Workflow[]> {
    const dir = await ensureDir()
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
    const fp = filePath(workflow.id)
    if (fsSync.existsSync(fp)) {
      throw new Error(`Workflow "${workflow.id}" already exists`)
    }
    await ensureDir()
    await fs.writeFile(fp, JSON.stringify(workflow, null, 2), "utf8")
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
    const fp = filePath(id)
    await ensureDir()
    await fs.writeFile(fp, JSON.stringify(workflow, null, 2), "utf8")
    return workflow
  }

  export async function remove(_baseDir: string | undefined, id: string): Promise<void> {
    try {
      await fs.unlink(filePath(id))
    } catch {
      throw new Error(`Workflow "${id}" not found`)
    }
  }

  /** Lists available workflow IDs, for error messages. */
  export async function availableIds(_baseDir?: string): Promise<string[]> {
    try {
      const dir = resolveDir()
      const entries = await fs.readdir(dir)
      return entries.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
    } catch {
      return []
    }
  }
}
