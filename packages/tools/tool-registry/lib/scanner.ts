import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const TOOLS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

// Excluded dirs that are not tool groups
const NON_GROUPS = new Set(["node_modules", "lib", "scripts", "build", "dist"])

async function discoverGroups(): Promise<string[]> {
  const entries = await fs.readdir(TOOLS_ROOT, { withFileTypes: true })
  const groups: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || NON_GROUPS.has(entry.name)) continue
    const hasIndex = await fs.access(path.join(TOOLS_ROOT, entry.name, "index.ts")).then(() => true).catch(() => false)
    if (hasIndex) groups.push(entry.name)
  }
  return groups
}

export interface ToolRecord {
  name: string
  group: string
  description: string
  inputSchema: {
    type: string
    properties?: Record<string, { type?: string; description?: string; [k: string]: any }>
    required?: string[]
    [k: string]: any
  }
  file: string
}

async function scanDir(dir: string, group: string, out: ToolRecord[]): Promise<void> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await scanDir(fullPath, group, out)
    } else if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "package.json") {
      try {
        const raw = JSON.parse(await fs.readFile(fullPath, "utf-8"))
        if (typeof raw.name === "string" && typeof raw.description === "string" && raw.inputSchema) {
          out.push({ name: raw.name, group, description: raw.description, inputSchema: raw.inputSchema, file: fullPath })
        }
      } catch {
        // skip malformed files
      }
    }
  }
}

export async function scanAllTools(): Promise<ToolRecord[]> {
  const results: ToolRecord[] = []
  const groups = await discoverGroups()
  for (const group of groups) {
    await scanDir(path.join(TOOLS_ROOT, group), group, results)
  }
  return results
}

export async function findTool(name: string): Promise<ToolRecord | undefined> {
  const all = await scanAllTools()
  return all.find((t) => t.name === name)
}

export function firstLine(description: string): string {
  return description.split("\n").find((l) => l.trim().length > 0)?.trim() ?? ""
}
