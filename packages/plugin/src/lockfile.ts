import fs from "fs/promises"
import path from "path"

export interface LockfileCapability {
  type: string
  name: string
  sourceGroup: string
}

export interface LockfileEntry {
  version: string
  source: string
  scope: "global" | "project"
  installedAt: string
  capabilities: LockfileCapability[]
  enabled?: boolean
  dependencies?: string[]
  configSchema?: Record<string, unknown>
}

export interface LockfileData {
  version: 1
  plugins: Record<string, LockfileEntry>
}

export namespace Lockfile {
  export function empty(): LockfileData {
    return { version: 1, plugins: {} }
  }

  export async function read(lockfilePath: string): Promise<LockfileData> {
    const text = await fs.readFile(lockfilePath, "utf-8").catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null
      throw err
    })
    if (text === null) return empty()
    return JSON.parse(text) as LockfileData
  }

  export async function write(lockfilePath: string, data: LockfileData): Promise<void> {
    const tmp = `${lockfilePath}.tmp`
    await fs.mkdir(path.dirname(lockfilePath), { recursive: true })
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8")
    await fs.rename(tmp, lockfilePath)
  }

  export async function addEntry(lockfilePath: string, pluginId: string, entry: LockfileEntry): Promise<void> {
    const data = await read(lockfilePath)
    data.plugins[pluginId] = entry
    await write(lockfilePath, data)
  }

  export async function removeEntry(lockfilePath: string, pluginId: string): Promise<void> {
    const data = await read(lockfilePath)
    delete data.plugins[pluginId]
    await write(lockfilePath, data)
  }

  export function merge(global: LockfileData, project: LockfileData): LockfileData {
    return {
      version: 1,
      plugins: { ...global.plugins, ...project.plugins },
    }
  }
}
