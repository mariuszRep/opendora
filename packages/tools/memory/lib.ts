import * as fs from "fs/promises"
import * as path from "path"

export interface MemoryEntry {
  name: string
  description: string
  type: string
  content: string
}

// Matches entries that start with --- and have name/description/type frontmatter.
// Lookahead stops at the next entry header or end of file.
const ENTRY_RE = /---\nname: (.+)\ndescription: (.+)\ntype: (.+)\n---\n([\s\S]*?)(?=\n---\nname:|\n*$)/g

export function parseEntries(raw: string): MemoryEntry[] {
  const entries: MemoryEntry[] = []
  ENTRY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ENTRY_RE.exec(raw)) !== null) {
    entries.push({
      name: match[1]!.trim(),
      description: match[2]!.trim(),
      type: match[3]!.trim(),
      content: match[4]!.trim(),
    })
  }
  return entries
}

export function serializeEntries(entries: MemoryEntry[]): string {
  return entries
    .map(e => `---\nname: ${e.name}\ndescription: ${e.description}\ntype: ${e.type}\n---\n${e.content}`)
    .join("\n\n")
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

export function resolveMemoryPath(projectFlowsDir: string, scope: "global" | "local", agentId: string): string {
  return scope === "global"
    ? path.join(projectFlowsDir, "agents", "MEMORY.md")
    : path.join(projectFlowsDir, "agents", agentId, "MEMORY.md")
}

export async function readMemoryFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8")
  } catch {
    return ""
  }
}
