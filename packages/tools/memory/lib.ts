import * as fs from "fs/promises"
import * as path from "path"

export interface MemoryEntry {
  name: string
  description: string
  type: string
  content: string
  createdAt: number
  updatedAt: number
}

export function parseMemoryJSON(raw: string): MemoryEntry[] {
  try {
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function serializeMemoryJSON(entries: MemoryEntry[]): string {
  return JSON.stringify(entries, null, 2)
}

export function entriesToMarkdown(entries: MemoryEntry[]): string {
  return entries
    .map(e => `---\nname: ${e.name}\ndescription: ${e.description}\ntype: ${e.type}\n---\n${e.content}`)
    .join("\n\n")
}

// Legacy MD format — used only for one-time auto-migration
const LEGACY_ENTRY_RE = /---\nname: (.+)\ndescription: (.+)\ntype: (.+)\n---\n([\s\S]*?)(?=\n---\nname:|\n*$)/g
function parseLegacyMD(raw: string): MemoryEntry[] {
  const entries: MemoryEntry[] = []
  LEGACY_ENTRY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  const now = Date.now()
  while ((match = LEGACY_ENTRY_RE.exec(raw)) !== null) {
    entries.push({
      name: match[1]!.trim(),
      description: match[2]!.trim(),
      type: match[3]!.trim(),
      content: match[4]!.trim(),
      createdAt: now,
      updatedAt: now,
    })
  }
  return entries
}

async function migrateIfNeeded(jsonPath: string): Promise<void> {
  try { await fs.access(jsonPath); return } catch {}
  const mdPath = jsonPath.replace(/\.json$/, ".md")
  let mdRaw: string
  try { mdRaw = await fs.readFile(mdPath, "utf-8") } catch { return }
  const entries = parseLegacyMD(mdRaw)
  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.writeFile(jsonPath, serializeMemoryJSON(entries), "utf-8")
  await fs.unlink(mdPath).catch(() => {})
}

export async function findProjectFlowsDir(startDir: string): Promise<string> {
  let dir = startDir
  while (true) {
    const candidate = path.join(dir, ".projectflows")
    try {
      const stat = await fs.stat(candidate)
      if (stat.isDirectory()) return candidate
    } catch {}
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error("Could not find .projectflows directory — are you inside a ProjectFlows project?")
    dir = parent
  }
}

export async function findProjectFlowsDirCandidates(dirs: Array<string | undefined>): Promise<string> {
  for (const d of dirs) {
    if (!d) continue
    const found = await findProjectFlowsDir(d).catch(() => null)
    if (found) return found
  }
  throw new Error("Could not find .projectflows directory — are you inside a ProjectFlows project?")
}

export function resolveMemoryPath(projectFlowsDir: string, scope: "global" | "local", agentId: string): string {
  return scope === "global"
    ? path.join(projectFlowsDir, "agents", "MEMORY.json")
    : path.join(projectFlowsDir, "agents", agentId, "MEMORY.json")
}

export async function readMemoryFile(filePath: string): Promise<MemoryEntry[]> {
  await migrateIfNeeded(filePath)
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    return parseMemoryJSON(raw)
  } catch {
    return []
  }
}

export async function writeMemoryFile(filePath: string, entries: MemoryEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, serializeMemoryJSON(entries), "utf-8")
}
