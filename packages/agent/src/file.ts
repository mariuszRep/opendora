/**
 * AgentFile — file-based agent storage for .opendora/agents/
 *
 * Lightweight file storage with no dependencies on Instance or global state.
 * All agents are stored as files - no "native" vs "file-based" distinction.
 */
import z from "zod"
import fs from "fs/promises"
import path from "path"
import { AgentConfig } from "./templates/types"

export namespace AgentFile {
  // ── Directory layout ──────────────────────────────────────────────────────
  export const OPENDORA_DIR = ".opendora"
  export const AGENTS_SUBDIR = "agents"
  export const INDEX_FILE = "index.json"

  /** Files that are allowed to be read or written inside an agent dir. */
  const ALLOWED_FILES = new Set(["agent.json", "PERSONA.md"])

  // ── Schemas ───────────────────────────────────────────────────────────────

  /** Re-export from templates */
  export const Config = AgentConfig
  export type Config = z.infer<typeof AgentConfig>

  /** One row in index.json's agents array */
  export const IndexEntry = z.object({
    id: z.string(),
    name: z.string(),
    mode: z.enum(["subagent", "primary", "all"]).default("all"),
    hidden: z.boolean().optional(),
  })
  export type IndexEntry = z.infer<typeof IndexEntry>

  /** Root shape of index.json */
  export const Index = z.object({
    agents: z.array(IndexEntry),
  })
  export type Index = z.infer<typeof Index>

  /** What callers work with after a load */
  export type Entry = {
    id: string
    config: Config
    persona: string
  }

  // ── Context ───────────────────────────────────────────────────────────────
  // All methods require a baseDirectory parameter (e.g., Instance.directory)

  // ── Path helpers ──────────────────────────────────────────────────────────

  function agentsRoot(baseDirectory: string): string {
    return path.join(baseDirectory, OPENDORA_DIR, AGENTS_SUBDIR)
  }

  function agentDir(baseDirectory: string, id: string): string {
    return path.join(agentsRoot(baseDirectory), id)
  }

  function indexPath(baseDirectory: string): string {
    return path.join(agentsRoot(baseDirectory), INDEX_FILE)
  }

  /** Ensure the .opendora/agents/ directory exists. Returns the path. */
  export async function ensureRoot(baseDirectory: string): Promise<string> {
    const root = agentsRoot(baseDirectory)
    await fs.mkdir(root, { recursive: true })
    return root
  }

  /**
   * Returns true if index.json does not yet exist — first run.
   * Once index.json is written (even empty) we treat the directory as
   * explicitly managed and never re-seed automatically.
   */
  export async function isFirstRun(baseDirectory: string): Promise<boolean> {
    return fs
      .access(indexPath(baseDirectory))
      .then(() => false)
      .catch(() => true)
  }

  /** Normalise a free-form string into a filesystem-safe slug. */
  export function toId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
  }

  // ── Security helpers ──────────────────────────────────────────────────────

  /**
   * Resolve the absolute path to a file inside an agent dir and verify it is:
   *  1. In ALLOWED_FILES (whitelist)
   *  2. Inside the agents root (no path traversal / escape)
   * Returns the resolved absolute path.
   */
  function resolveAllowed(baseDirectory: string, agentId: string, filename: string): string {
    if (!ALLOWED_FILES.has(filename)) {
      throw new Error(`"${filename}" is not allowed. Allowed files: ${[...ALLOWED_FILES].join(", ")}`)
    }
    const root = path.resolve(agentsRoot(baseDirectory))
    const target = path.resolve(path.join(root, agentId, filename))
    // Boundary check — must stay inside agents root
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`Path traversal detected: ${filename}`)
    }
    return target
  }

  /**
   * Safe read: whitelist + boundary + no symlinks + no hardlinks.
   * Throws if the file does not exist (callers use .catch(() => "") for optional files).
   */
  async function safeRead(baseDirectory: string, agentId: string, filename: string): Promise<string> {
    const target = resolveAllowed(baseDirectory, agentId, filename)
    const lstat = await fs.lstat(target).catch(() => null)
    if (lstat) {
      if (lstat.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${filename}`)
      if (!lstat.isFile()) throw new Error(`Not a regular file: ${filename}`)
      if (lstat.nlink > 1) throw new Error(`Hardlinks are not allowed: ${filename}`)
    }
    return fs.readFile(target, "utf-8")
  }

  /**
   * Safe write: whitelist + boundary check before writing.
   * Parent directory must already exist (caller ensures this).
   */
  async function safeWrite(baseDirectory: string, agentId: string, filename: string, content: string): Promise<void> {
    const target = resolveAllowed(baseDirectory, agentId, filename)
    await fs.writeFile(target, content, "utf-8")
  }

  // ── Index helpers (applyToIndex / pruneFromIndex) ─────────────────────────

  export async function readIndex(baseDirectory: string): Promise<Index> {
    const raw = await fs.readFile(indexPath(), "utf-8").catch(() => null)
    if (!raw) return { agents: [] }
    try {
      return Index.parse(JSON.parse(raw))
    } catch {
      log.warn("index.json is malformed, starting fresh")
      return { agents: [] }
    }
  }

  async function writeIndex(baseDirectory: string, index: Index): Promise<void> {
    await fs.writeFile(indexPath(), JSON.stringify(index, null, 2), "utf-8")
  }

  /**
   * applyToIndex — upsert an entry into agents[].
   * Replaces the existing row if id matches, appends otherwise.
   */
  export function applyToIndex(index: Index, entry: IndexEntry): Index {
    const i = index.agents.findIndex((a) => a.id === entry.id)
    if (i >= 0) {
      return { agents: index.agents.map((a, idx) => (idx === i ? entry : a)) }
    }
    return { agents: [...index.agents, entry] }
  }

  /**
   * pruneFromIndex — remove an entry from agents[].
   * Also removes any cross-references (future: tools.agentToAgent).
   */
  export function pruneFromIndex(index: Index, id: string): Index {
    return { agents: index.agents.filter((a) => a.id !== id) }
  }

  // ── Agent CRUD ────────────────────────────────────────────────────────────

  /** Load all agents listed in index.json, in index order. */
  export async function loadAll(baseDirectory: string): Promise<Entry[]> {
    await ensureRoot()
    const index = await readIndex(baseDirectory: string)
    const results: Entry[] = []
    for (const row of index.agents) {
      const entry = await load(row.id).catch((err) => {
        log.warn("skipping unreadable agent", { id: row.id, err })
        return null
      })
      if (entry) results.push(entry)
    }
    return results
  }

  /**
   * Load a single agent by id.
   * Persona resolution: persona.md takes precedence; if absent/empty,
   * soul.md + identity.md are merged (soul + identity = persona).
   */
  export async function load(baseDirectory: string, id: string): Promise<Entry> {
    const configRaw = await safeRead(id, "agent.json")
    const config = Config.parse(JSON.parse(configRaw))

    const persona = await safeRead(id, "PERSONA.md").catch(() => "")

    return { id, config, persona }
  }

  /**
   * Create a new agent.
   * Openclaw pattern: filesystem preflight (mkdir + file writes) happens
   * BEFORE index write so a failed write never leaves a broken index entry.
   */
  export async function create(baseDirectory: string, id: string, config: Config, persona = ""): Promise<Entry> {
    await ensureRoot()

    const dir = agentDir(id)

    // ── Preflight: ensure agent dir + write files FIRST ──────────────────
    await fs.mkdir(dir, { recursive: true })
    const validated = Config.parse(config)
    await safeWrite(id, "agent.json", JSON.stringify(validated, null, 2))
    await safeWrite(id, "PERSONA.md", persona)

    // ── Only update index after filesystem is consistent ─────────────────
    const index = await readIndex(baseDirectory: string)
    const next = applyToIndex(index, {
      id,
      name: validated.name,
      mode: validated.mode ?? "all",
      hidden: validated.hidden,
    })
    await writeIndex(baseDirectory: string, next)

    log.info("agent created", { id })
    return { id, config: validated, persona }
  }

  /**
   * Update an existing agent.
   * File writes before index write (same preflight guarantee as create).
   */
  export async function update(baseDirectory: string, id: string, patch: Partial<Config>, persona?: string): Promise<Entry> {
    const existing = await load(id)
    // Explicitly merge fields — patch values (including undefined) override existing
    const merged: Partial<Config> = { ...existing.config }
    for (const key of Object.keys(patch) as Array<keyof Config>) {
      merged[key] = patch[key] as any
    }
    const next = Config.parse(merged)
    const nextPersona = persona ?? existing.persona

    // ── File writes first ────────────────────────────────────────────────
    await safeWrite(id, "agent.json", JSON.stringify(next, null, 2))
    if (persona !== undefined) {
      await safeWrite(id, "PERSONA.md", nextPersona)
    }

    // ── Index update after filesystem is consistent ──────────────────────
    const index = await readIndex(baseDirectory: string)
    const updated = applyToIndex(index, {
      id,
      name: next.name,
      mode: next.mode ?? "all",
      hidden: next.hidden,
    })
    await writeIndex(baseDirectory: string, updated)

    log.info("agent updated", { id })
    return { id, config: next, persona: nextPersona }
  }

  /**
   * Delete an agent.
   * Index is pruned first (source of truth), then directory removed.
   */
  export async function remove(baseDirectory: string, id: string): Promise<void> {
    const index = await readIndex(baseDirectory: string)
    const pruned = pruneFromIndex(index, id)
    await writeIndex(baseDirectory: string, pruned)
    await fs.rm(agentDir(id), { recursive: true, force: true })
    log.info("agent removed", { id })
  }

  /** Read PERSONA.md for an agent (safe, returns "" if missing). */
  export async function getPersona(baseDirectory: string, id: string): Promise<string> {
    return safeRead(id, "PERSONA.md").catch(() => "")
  }

  /** Overwrite PERSONA.md for an agent. */
  export async function setPersona(baseDirectory: string, id: string, text: string): Promise<void> {
    await safeWrite(id, "PERSONA.md", text)
  }

  /** Check if an agent id is registered in index.json. */
  export async function exists(baseDirectory: string, id: string): Promise<boolean> {
    const index = await readIndex(baseDirectory: string)
    return index.agents.some((a) => a.id === id)
  }
}
