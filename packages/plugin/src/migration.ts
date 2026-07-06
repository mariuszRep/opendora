import fs from "fs/promises"
import path from "path"
import { PluginStorage } from "./storage.js"

/**
 * One-time migration from flat ~/.projectflows/tools/*.js layout to the
 * self-contained group folder layout ~/.projectflows/tool-groups/<group>/tools/*.js.
 *
 * Returns true if migration ran, false if already migrated or nothing to migrate.
 *
 * @param capRoot        Capability root to migrate (e.g. ~/.projectflows/)
 * @param toolsSourceDir Optional path to packages/tools root; used to copy authoritative
 *                       group.json manifests. Falls back to writing stub manifests.
 */
export async function runMigrationIfNeeded(capRoot: string, toolsSourceDir?: string): Promise<boolean> {
  const flatToolsDir = path.join(capRoot, "tools")

  // Check whether any flat .js files still exist
  let flatFiles: string[]
  try {
    const entries = await fs.readdir(flatToolsDir)
    flatFiles = entries.filter((f) => f.endsWith(".js") || f.endsWith(".ts"))
  } catch {
    return false // tools/ dir doesn't exist — nothing to migrate
  }

  if (flatFiles.length === 0) return false

  // Load group manifests from packages/tools source dir for accurate group resolution
  let manifests: Array<{ id: string; tools: string[] }> = []
  if (toolsSourceDir) {
    try {
      const groupDirs = await fs.readdir(toolsSourceDir, { withFileTypes: true })
      for (const entry of groupDirs) {
        if (!entry.isDirectory()) continue
        const manifestPath = path.join(toolsSourceDir, entry.name, "group.json")
        const raw = await fs.readFile(manifestPath, "utf-8").catch(() => null)
        if (!raw) continue
        try {
          const parsed = JSON.parse(raw) as { id: string; tools: string[] }
          if (parsed.id && Array.isArray(parsed.tools)) manifests.push(parsed)
        } catch {
          // ignore malformed manifests
        }
      }
    } catch {
      // toolsSourceDir not readable — fall back to getToolGroup()
    }
  }

  // Lazy-load getToolGroup fallback
  let getToolGroupFn: ((id: string) => string) | null = null
  async function resolveGroup(toolId: string): Promise<string> {
    // Check manifests first
    for (const m of manifests) {
      if (m.tools.includes(toolId)) return m.id
    }
    // Fall back to runtime helper
    if (!getToolGroupFn) {
      try {
        const mod = await import("@projectflows/tools/group-manifest")
        getToolGroupFn = mod.getToolGroup as (id: string) => string
      } catch {
        getToolGroupFn = () => "others"
      }
    }
    return getToolGroupFn(toolId)
  }

  // Migrate each flat tool file
  for (const file of flatFiles) {
    const toolId = path.basename(file, path.extname(file))
    const groupId = await resolveGroup(toolId)

    const toolsDest = PluginStorage.toolGroupToolsDir(capRoot, groupId)
    await fs.mkdir(toolsDest, { recursive: true })
    await fs.rename(path.join(flatToolsDir, file), path.join(toolsDest, file))

    // Write group.json — prefer authoritative copy from toolsSourceDir
    const manifestDest = PluginStorage.toolGroupManifestPath(capRoot, groupId)
    const manifestExists = await fs.access(manifestDest).then(() => true).catch(() => false)
    if (!manifestExists) {
      if (toolsSourceDir) {
        const srcManifest = path.join(toolsSourceDir, groupId, "group.json")
        await fs.copyFile(srcManifest, manifestDest).catch(async () => {
          // No authoritative manifest — write stub
          const stub = { id: groupId, name: groupId, description: "", icon: "Wrench", tools: [] as string[], sourceGroup: "core" }
          await fs.writeFile(manifestDest, JSON.stringify(stub, null, 2), "utf-8")
        })
      } else {
        const stub = { id: groupId, name: groupId, description: "", icon: "Wrench", tools: [] as string[], sourceGroup: "core" }
        await fs.writeFile(manifestDest, JSON.stringify(stub, null, 2), "utf-8")
      }
    }
  }

  // Remove the now-empty flat tools directory
  try {
    const remaining = await fs.readdir(flatToolsDir)
    if (remaining.length === 0) {
      await fs.rmdir(flatToolsDir)
    }
  } catch {
    // ignore — directory may already be gone
  }

  return true
}
