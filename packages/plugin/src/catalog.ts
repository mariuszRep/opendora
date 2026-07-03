import path from "path"
import fs from "fs/promises"
import os from "os"

export interface PackDefinition {
  id: string
  name: string
  description: string
  plugins: string[]
}

function catalogPath(): string {
  return process.env["PROJECTFLOWS_PLUGINS_CATALOG"] ?? path.join(os.homedir(), "projects", "projectflows-plugins")
}

export namespace CatalogReader {
  export async function listPacks(): Promise<PackDefinition[]> {
    const packsDir = path.join(catalogPath(), "packs")
    try {
      const files = (await fs.readdir(packsDir)).filter((f) => f.endsWith(".json")).sort()
      const packs = await Promise.all(
        files.map(async (f) => JSON.parse(await fs.readFile(path.join(packsDir, f), "utf-8")) as PackDefinition),
      )
      return packs
    } catch {
      return []
    }
  }

  export async function getPack(id: string): Promise<PackDefinition | null> {
    const packs = await listPacks()
    return packs.find((p) => p.id === id) ?? null
  }

  export function pluginSourcePath(pluginId: string): string {
    return path.join(catalogPath(), "plugins", pluginId)
  }
}
