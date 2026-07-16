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
  if (process.env["PROJECTFLOWS_REGISTRY_PATH"]) return process.env["PROJECTFLOWS_REGISTRY_PATH"]
  if (process.env["PROJECTFLOWS_PLUGINS_CATALOG"]) {
    console.warn("[deprecation] PROJECTFLOWS_PLUGINS_CATALOG is deprecated — use PROJECTFLOWS_REGISTRY_PATH instead")
    return process.env["PROJECTFLOWS_PLUGINS_CATALOG"]
  }
  return path.join(os.homedir(), "projects", "projectflows-website", "registry")
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

  /**
   * Build a temp staging directory that includes the plugin manifest AND all
   * referenced content (tool-group folders, agents, skills). This is needed
   * because the catalog stores plugin manifests and tool-group content in
   * separate directories; PluginInstaller.install() expects them together.
   *
   * Caller is responsible for cleaning up the returned temp directory.
   */
  export async function buildPluginStaging(pluginId: string): Promise<string> {
    const catalog = catalogPath()
    const manifestPath = path.join(catalog, "plugins", pluginId, "manifest.json")
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"))
    const staging = await fs.mkdtemp(path.join(os.tmpdir(), `pf-install-${pluginId}-`))

    await fs.copyFile(manifestPath, path.join(staging, "manifest.json"))

    for (const cap of manifest.capabilities ?? []) {
      if (cap.type === "tool-group") {
        const src = path.join(catalog, "tools", cap.name)
        const dest = path.join(staging, "tools", cap.name)
        await fs.mkdir(dest, { recursive: true })
        // Copy group.json
        const groupJson = path.join(src, "group.json")
        const groupJsonDest = path.join(dest, "group.json")
        await fs.copyFile(groupJson, groupJsonDest).catch(() => {})
        // Copy all files from tools/ (JS bundles + WASM + other assets)
        const toolsSrc = path.join(src, "tools")
        const toolsDest = path.join(dest, "tools")
        await fs.mkdir(toolsDest, { recursive: true })
        const files = await fs.readdir(toolsSrc).catch(() => [] as string[])
        for (const f of files) {
          await fs.copyFile(path.join(toolsSrc, f), path.join(toolsDest, f)).catch(() => {})
        }
      } else if (cap.type === "agent") {
        await copyDir(path.join(catalog, "agents", cap.name), path.join(staging, "agents", cap.name))
      } else if (cap.type === "skill") {
        await copyDir(path.join(catalog, "skills", cap.name), path.join(staging, "skills", cap.name))
      } else if (cap.type === "workflow") {
        const src = path.join(catalog, "workflows", cap.name, `${cap.name}.json`)
        const dest = path.join(staging, "workflows", `${cap.name}.json`)
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await fs.copyFile(src, dest)
      }
    }

    return staging
  }

  async function copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true }).catch(() => {})
    const entries = await fs.readdir(src, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const s = path.join(src, entry.name)
      const d = path.join(dest, entry.name)
      if (entry.isDirectory()) await copyDir(s, d)
      else await fs.copyFile(s, d).catch(() => {})
    }
  }
}
