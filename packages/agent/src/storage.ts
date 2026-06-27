/**
 * Agent file storage - pure functions with no global state
 * All operations require a baseDirectory parameter
 */
import z from "zod"
import fs from "fs/promises"
import path from "path"
import { AgentConfig } from "./templates/types"

export namespace AgentStorage {
  // ── Constants ─────────────────────────────────────────────────────────────
  export const OPENDORA_DIR = ".projectflows"
  export const AGENTS_SUBDIR = "agents"
  export const INDEX_FILE = "index.json"
  const ALLOWED_FILES = new Set(["agent.json", "PERSONA.md", "INJECTION.md"])

  // ── Types ─────────────────────────────────────────────────────────────────
  export const Config = AgentConfig
  export const ConfigSchema = AgentConfig
  export type Config = z.infer<typeof AgentConfig>

  export const IndexEntry = z.object({
    id: z.string(),
    name: z.string(),
    mode: z.enum(["subagent", "primary", "all", "worker", "system"]).default("all"),
    hidden: z.boolean().optional(),
  })
  export type IndexEntry = z.infer<typeof IndexEntry>

  export const Index = z.object({
    agents: z.array(IndexEntry),
  })
  export type Index = z.infer<typeof Index>

  export type Entry = {
    id: string
    config: Config
    persona: string
  }

  // ── Path Helpers ──────────────────────────────────────────────────────────

  function agentsRoot(baseDir: string): string {
    return path.join(baseDir, OPENDORA_DIR, AGENTS_SUBDIR)
  }

  function agentDir(baseDir: string, id: string): string {
    return path.join(agentsRoot(baseDir), id)
  }

  function indexPath(baseDir: string): string {
    return path.join(agentsRoot(baseDir), INDEX_FILE)
  }

  function resolveAllowed(baseDir: string, id: string, filename: string): string {
    if (!ALLOWED_FILES.has(filename)) {
      throw new Error(`"${filename}" not allowed. Allowed: ${[...ALLOWED_FILES].join(", ")}`)
    }
    const root = path.resolve(agentsRoot(baseDir))
    const target = path.resolve(path.join(root, id, filename))
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`Path traversal detected: ${filename}`)
    }
    return target
  }

  // ── File I/O ──────────────────────────────────────────────────────────────

  async function safeRead(baseDir: string, id: string, filename: string): Promise<string> {
    const target = resolveAllowed(baseDir, id, filename)
    const lstat = await fs.lstat(target).catch(() => null)
    if (lstat) {
      if (lstat.isSymbolicLink()) throw new Error(`Symlinks not allowed: ${filename}`)
      if (!lstat.isFile()) throw new Error(`Not a file: ${filename}`)
      if (lstat.nlink > 1) throw new Error(`Hardlinks not allowed: ${filename}`)
    }
    return fs.readFile(target, "utf-8")
  }

  async function safeWrite(baseDir: string, id: string, filename: string, content: string): Promise<void> {
    const target = resolveAllowed(baseDir, id, filename)
    await fs.writeFile(target, content, "utf-8")
  }

  // ── Index Operations ──────────────────────────────────────────────────────

  async function readIndex(baseDir: string): Promise<Index> {
    const raw = await fs.readFile(indexPath(baseDir), "utf-8").catch(() => null)
    if (!raw) return { agents: [] }
    try {
      return Index.parse(JSON.parse(raw))
    } catch {
      return { agents: [] }
    }
  }

  async function writeIndex(baseDir: string, index: Index): Promise<void> {
    await fs.writeFile(indexPath(baseDir), JSON.stringify(index, null, 2), "utf-8")
  }

  function applyToIndex(index: Index, entry: IndexEntry): Index {
    const i = index.agents.findIndex((a) => a.id === entry.id)
    if (i >= 0) {
      return { agents: index.agents.map((a, idx) => (idx === i ? entry : a)) }
    }
    return { agents: [...index.agents, entry] }
  }

  function pruneFromIndex(index: Index, id: string): Index {
    return { agents: index.agents.filter((a) => a.id !== id) }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  export async function ensureRoot(baseDir: string): Promise<string> {
    const root = agentsRoot(baseDir)
    await fs.mkdir(root, { recursive: true })
    return root
  }

  export async function isFirstRun(baseDir: string): Promise<boolean> {
    return fs
      .access(indexPath(baseDir))
      .then(() => false)
      .catch(() => true)
  }

  export function toId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
  }

  export async function loadAll(baseDir: string): Promise<Entry[]> {
    const root = await ensureRoot(baseDir)
    const index = await readIndex(baseDir)
    const indexMap = new Map(index.agents.map((a) => [a.id, a]))

    // Scan subdirectories — only entries backed by a valid agent.json are returned.
    // Files (LOG.md, INJECTION.md, PERSONA.md, …) and dirs without agent.json are
    // silently skipped, so they can never bleed into the agent panel.
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [] as fs.Dirent[])
    const results: Entry[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const loaded = await load(baseDir, entry.name)
        // Overlay index metadata (mode, hidden) that may not live in agent.json
        const meta = indexMap.get(entry.name)
        if (meta) {
          if (meta.mode && !loaded.config.mode) (loaded.config as any).mode = meta.mode
          if (meta.hidden !== undefined && loaded.config.hidden === undefined) (loaded.config as any).hidden = meta.hidden
        }
        results.push(loaded)
      } catch {
        // Skip dirs without a valid agent.json
      }
    }
    return results
  }

  export async function load(baseDir: string, id: string): Promise<Entry> {
    const configRaw = await safeRead(baseDir, id, "agent.json")
    const config = ConfigSchema.parse(JSON.parse(configRaw))
    const persona = await safeRead(baseDir, id, "PERSONA.md").catch(() => "")
    return { id, config, persona }
  }

  export async function create(baseDir: string, id: string, config: Config, persona = "", injection = ""): Promise<Entry> {
    await ensureRoot(baseDir)
    const dir = agentDir(baseDir, id)

    // Filesystem writes first
    await fs.mkdir(dir, { recursive: true })
    const validated = Config.parse(config)
    await safeWrite(baseDir, id, "agent.json", JSON.stringify(validated, null, 2))
    await safeWrite(baseDir, id, "PERSONA.md", persona)
    if (injection) {
      await safeWrite(baseDir, id, "INJECTION.md", injection)
    }

    // Then update index
    const index = await readIndex(baseDir)
    const next = applyToIndex(index, {
      id,
      name: validated.name,
      mode: validated.mode ?? "all",
      hidden: validated.hidden,
    })
    await writeIndex(baseDir, next)

    return { id, config: validated, persona }
  }

  export async function update(baseDir: string, id: string, patch: Partial<Config>, persona?: string, injection?: string): Promise<Entry> {
    const existing = await load(baseDir, id)

    // Explicit merge - patch values (including undefined) override existing
    const merged: Partial<Config> = { ...existing.config }
    for (const key of Object.keys(patch) as Array<keyof Config>) {
      merged[key] = patch[key] as any
    }
    const next = ConfigSchema.parse(merged)
    const nextPersona = persona ?? existing.persona

    // Filesystem writes first
    await safeWrite(baseDir, id, "agent.json", JSON.stringify(next, null, 2))
    if (persona !== undefined) {
      await safeWrite(baseDir, id, "PERSONA.md", nextPersona)
    }
    if (injection !== undefined) {
      await safeWrite(baseDir, id, "INJECTION.md", injection)
    }

    // Then update index
    const index = await readIndex(baseDir)
    const updated = applyToIndex(index, {
      id,
      name: next.name,
      mode: next.mode ?? "all",
      hidden: next.hidden,
    })
    await writeIndex(baseDir, updated)

    return { id, config: next, persona: nextPersona }
  }

  export async function remove(baseDir: string, id: string): Promise<void> {
    const index = await readIndex(baseDir)
    const pruned = pruneFromIndex(index, id)
    await writeIndex(baseDir, pruned)
    await fs.rm(agentDir(baseDir, id), { recursive: true, force: true })
  }

  export async function getPersona(baseDir: string, id: string): Promise<string> {
    return safeRead(baseDir, id, "PERSONA.md").catch(() => "")
  }

  export async function setPersona(baseDir: string, id: string, text: string): Promise<void> {
    await safeWrite(baseDir, id, "PERSONA.md", text)
  }

  export async function getInjection(baseDir: string, id: string): Promise<string> {
    return safeRead(baseDir, id, "INJECTION.md").catch(() => "")
  }

  export async function setInjection(baseDir: string, id: string, text: string): Promise<void> {
    await safeWrite(baseDir, id, "INJECTION.md", text)
  }

  export async function exists(baseDir: string, id: string): Promise<boolean> {
    const index = await readIndex(baseDir)
    return index.agents.some((a) => a.id === id)
  }
}
