import fs from "fs/promises"
import type { Dirent } from "fs"
import path from "path"
import { attachSourceGroups } from "./source-group.js"
import { PluginStorage } from "./storage.js"
import { Lockfile, type LockfileEntry, type LockfileCapability } from "./lockfile.js"
import { PluginScope } from "./scope.js"
import { checkConflict, type ConflictPolicy } from "./conflict.js"
import { assertRemovable } from "./uninstall.js"
import { LocalPathSource } from "./source.js"
import type { Plugin } from "./manifest.js"

export interface PluginListItem extends LockfileEntry {
  pluginId: string
  enabled: boolean
}

// Subdirectories inside a plugin source that are extracted to the capability root.
// Tools are handled separately via the tool-groups/ layout.
const CAP_SUBDIRS = ["agents", "skills", "workflows"] as const

// Fallback group resolution when a plugin capability lacks an explicit group field.
// Import is lazy to avoid requiring @projectflows/tools at startup.
async function inferGroup(toolName: string, capRoot: string): Promise<string> {
  try {
    const { loadGroupManifests, resolveToolGroup } = await import("@projectflows/tools/group-manifest")
    const manifests = [
      ...(await loadGroupManifests(PluginStorage.toolGroupsDir(capRoot)).catch(() => [])),
      ...(await loadGroupManifests(PluginStorage.toolGroupsDir(PluginStorage.globalRoot())).catch(() => [])),
    ]
    return resolveToolGroup(toolName, manifests) ?? "others"
  } catch {
    return "others"
  }
}

async function extractTools(
  sourcePath: string,
  capRoot: string,
  capabilities: Plugin.Capability[],
): Promise<Array<{ name: string; group: string }>> {
  const results: Array<{ name: string; group: string }> = []

  // Prefer new tools/ bundle format
  const toolGroupsSrc = path.join(sourcePath, "tools")
  const hasToolGroups = await fs.access(toolGroupsSrc).then(() => true).catch(() => false)

  if (hasToolGroups) {
    // New format: plugin bundle contains tools/<group>/group.json + tools/*.js
    const groupEntries = await fs.readdir(toolGroupsSrc, { withFileTypes: true })
    for (const groupEntry of groupEntries) {
      if (!groupEntry.isDirectory()) continue
      const groupId = groupEntry.name
      const groupSrc = path.join(toolGroupsSrc, groupId)
      const groupDest = PluginStorage.toolGroupDir(capRoot, groupId)
      await fs.mkdir(groupDest, { recursive: true })

      // Copy group.json (don't overwrite if an authoritative copy already exists)
      const manifestSrc = path.join(groupSrc, "group.json")
      const manifestDest = PluginStorage.toolGroupManifestPath(capRoot, groupId)
      const manifestExists = await fs.access(manifestDest).then(() => true).catch(() => false)
      if (!manifestExists) {
        await fs.copyFile(manifestSrc, manifestDest).catch(() => {})
      }

      // Copy all files from tools/ (JS bundles + WASM/assets needed at runtime)
      const toolsSrc = path.join(groupSrc, "tools")
      const toolsDest = PluginStorage.toolGroupToolsDir(capRoot, groupId)
      await fs.mkdir(toolsDest, { recursive: true })
      const toolFiles = await fs.readdir(toolsSrc).catch(() => [] as string[])
      for (const toolFile of toolFiles) {
        await fs.copyFile(path.join(toolsSrc, toolFile), path.join(toolsDest, toolFile))
        if (toolFile.endsWith(".js") || toolFile.endsWith(".ts")) {
          results.push({ name: path.basename(toolFile, path.extname(toolFile)), group: groupId })
        }
      }
    }
  } else {
    // Legacy format: flat tools/ directory — infer group per tool
    const toolsSrc = path.join(sourcePath, "tools")
    const toolFiles = await fs.readdir(toolsSrc).catch(() => [] as string[])
    for (const toolFile of toolFiles) {
      if (!toolFile.endsWith(".js") && !toolFile.endsWith(".ts")) continue
      const toolName = path.basename(toolFile, path.extname(toolFile))
      // Prefer explicit group from manifest capability entry
      const capEntry = capabilities.find((c) => c.type === "tool" && c.name === toolName)
      const groupId = capEntry?.group ?? (await inferGroup(toolName, capRoot))
      const toolsDest = PluginStorage.toolGroupToolsDir(capRoot, groupId)
      await fs.mkdir(toolsDest, { recursive: true })
      await fs.copyFile(path.join(toolsSrc, toolFile), path.join(toolsDest, toolFile))

      // Write a minimal group.json stub if nothing exists yet
      const manifestDest = PluginStorage.toolGroupManifestPath(capRoot, groupId)
      const manifestExists = await fs.access(manifestDest).then(() => true).catch(() => false)
      if (!manifestExists) {
        const stub = { id: groupId, name: groupId, description: "", icon: "Wrench", tools: [] as string[], sourceGroup: "" }
        await fs.writeFile(manifestDest, JSON.stringify(stub, null, 2), "utf-8")
      }
      results.push({ name: toolName, group: groupId })
    }
  }

  return results
}

async function extractCapabilities(
  sourcePath: string,
  capRoot: string,
  capabilities: Plugin.Capability[],
): Promise<void> {
  // Agents and skills — unchanged from original behavior
  for (const subdir of CAP_SUBDIRS) {
    const src = path.join(sourcePath, subdir)
    const dest = path.join(capRoot, subdir)
    let entries: Dirent[]
    try {
      entries = await fs.readdir(src, { withFileTypes: true })
    } catch {
      continue
    }
    await fs.mkdir(dest, { recursive: true })
    for (const entry of entries) {
      const destEntry = path.join(dest, entry.name)
      // Skip if already on disk — preserves user customizations
      const exists = await fs.access(destEntry).then(() => true).catch(() => false)
      if (exists) continue
      await fs.cp(path.join(src, entry.name), destEntry, { recursive: true })
    }
  }

  // Tools — grouped layout
  await extractTools(sourcePath, capRoot, capabilities)
}

async function removeCapabilities(capabilities: LockfileEntry["capabilities"], capRoot: string): Promise<void> {
  for (const cap of capabilities) {
    if (cap.type === "agent") {
      await fs.rm(path.join(capRoot, "agents", cap.name), { recursive: true, force: true })
    } else if (cap.type === "skill") {
      await fs.rm(path.join(capRoot, "skills", cap.name), { recursive: true, force: true })
    } else if (cap.type === "workflow") {
      await fs.rm(path.join(capRoot, "workflows", `${cap.name}.json`), { force: true })
    } else if (cap.type === "tool-group") {
      await fs.rm(PluginStorage.toolGroupDir(capRoot, cap.name), { recursive: true, force: true })
    } else if (cap.type === "tool") {
      if (cap.group) {
        // Fast path: group stored in lockfile
        const toolsDir = PluginStorage.toolGroupToolsDir(capRoot, cap.group)
        for (const ext of [".js", ".ts"]) {
          await fs.rm(path.join(toolsDir, `${cap.name}${ext}`), { force: true }).catch(() => {})
        }
      } else {
        // Fallback: scan all group dirs
        const groupsDir = PluginStorage.toolGroupsDir(capRoot)
        const groups = await fs.readdir(groupsDir).catch(() => [] as string[])
        for (const groupId of groups) {
          const toolsDir = PluginStorage.toolGroupToolsDir(capRoot, groupId)
          for (const ext of [".js", ".ts"]) {
            await fs.rm(path.join(toolsDir, `${cap.name}${ext}`), { force: true }).catch(() => {})
          }
        }
      }
    }
  }
}

export namespace PluginInstaller {
  export interface InstallOptions {
    sourcePath: string
    scope?: "global" | "project"
    projectDir?: string
    conflictPolicy?: ConflictPolicy
  }

  export async function install(opts: InstallOptions): Promise<PluginListItem> {
    const { sourcePath, scope = "global", projectDir, conflictPolicy = "error" } = opts
    const source = new LocalPathSource()
    const pkg = await source.fetch(sourcePath)
    const manifest = attachSourceGroups(pkg.manifest)
    const { pluginId, version, capabilities, dependencies, configSchema } = manifest

    const resolved = await PluginScope.resolve(projectDir)
    const existing = resolved.effective.plugins[pluginId]
    if (existing) {
      checkConflict(pluginId, { source: sourcePath, version }, existing, conflictPolicy)
    }

    // Plugin bundle dir: ~/.projectflows/plugins/<id>/
    const pluginDir =
      scope === "project" && projectDir
        ? PluginStorage.projectPluginDir(pluginId, projectDir)
        : PluginStorage.globalPluginDir(pluginId)

    // Capability root: ~/.projectflows/
    const capRoot =
      scope === "project" && projectDir
        ? PluginStorage.projectConfigRoot(projectDir)
        : PluginStorage.globalRoot()

    await fs.mkdir(pluginDir, { recursive: true })
    await fs.cp(sourcePath, pluginDir, { recursive: true })

    // Extract agents, skills, and tools (grouped) into the capability root
    await extractCapabilities(sourcePath, capRoot, capabilities)

    // Determine the resolved group for each tool capability (for lockfile storage)
    const toolGroupResolved = await resolveToolGroups(sourcePath, capRoot, capabilities)

    const lockfilePath =
      scope === "project" && projectDir
        ? PluginStorage.projectLockfilePath(projectDir)
        : PluginStorage.globalLockfilePath()

    const entry: LockfileEntry = {
      version,
      source: sourcePath,
      scope,
      installedAt: new Date().toISOString(),
      capabilities: capabilities.map((cap): LockfileCapability => ({
        type: cap.type,
        name: cap.name,
        sourceGroup: cap.sourceGroup ?? `plugin:${pluginId}`,
        ...(cap.type === "tool" ? { group: toolGroupResolved.get(cap.name) ?? cap.group } : {}),
      })),
      enabled: true,
      ...(dependencies && { dependencies }),
      ...(configSchema && { configSchema }),
    }

    await Lockfile.addEntry(lockfilePath, pluginId, entry)
    return { pluginId, ...entry, enabled: true }
  }

  // Determine the group for each tool in the plugin source, mirroring extractTools logic.
  async function resolveToolGroups(
    sourcePath: string,
    capRoot: string,
    capabilities: Plugin.Capability[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    const toolGroupsSrc = path.join(sourcePath, "tools")
    const hasToolGroups = await fs.access(toolGroupsSrc).then(() => true).catch(() => false)

    if (hasToolGroups) {
      const groupEntries = await fs.readdir(toolGroupsSrc, { withFileTypes: true })
      for (const ge of groupEntries) {
        if (!ge.isDirectory()) continue
        const toolFiles = await fs.readdir(path.join(toolGroupsSrc, ge.name, "tools")).catch(() => [] as string[])
        for (const f of toolFiles) {
          if (f.endsWith(".js") || f.endsWith(".ts")) {
            result.set(path.basename(f, path.extname(f)), ge.name)
          }
        }
      }
    } else {
      const toolFiles = await fs.readdir(path.join(sourcePath, "tools")).catch(() => [] as string[])
      for (const f of toolFiles) {
        if (!f.endsWith(".js") && !f.endsWith(".ts")) continue
        const toolName = path.basename(f, path.extname(f))
        const capEntry = capabilities.find((c) => c.type === "tool" && c.name === toolName)
        result.set(toolName, capEntry?.group ?? (await inferGroup(toolName, capRoot)))
      }
    }

    return result
  }

  export async function list(projectDir?: string): Promise<PluginListItem[]> {
    const resolved = await PluginScope.resolve(projectDir)
    return Object.entries(resolved.effective.plugins).map(([pluginId, entry]) => ({
      pluginId,
      ...entry,
      enabled: entry.enabled !== false,
    }))
  }

  export async function info(pluginId: string, projectDir?: string): Promise<PluginListItem | null> {
    const resolved = await PluginScope.resolve(projectDir)
    const entry = resolved.effective.plugins[pluginId]
    if (!entry) return null
    return { pluginId, ...entry, enabled: entry.enabled !== false }
  }

  export async function remove(
    pluginId: string,
    opts: { scope: "global" | "project"; projectDir?: string },
  ): Promise<void> {
    const { scope, projectDir } = opts
    const lockfilePath =
      scope === "project" && projectDir
        ? PluginStorage.projectLockfilePath(projectDir)
        : PluginStorage.globalLockfilePath()

    const data = await Lockfile.read(lockfilePath)
    assertRemovable(pluginId, data)

    const capRoot =
      scope === "project" && projectDir
        ? PluginStorage.projectConfigRoot(projectDir)
        : PluginStorage.globalRoot()

    const entry = data.plugins[pluginId]
    if (entry) {
      await removeCapabilities(entry.capabilities, capRoot)
    }

    const pluginDir =
      scope === "project" && projectDir
        ? PluginStorage.projectPluginDir(pluginId, projectDir)
        : PluginStorage.globalPluginDir(pluginId)

    await fs.rm(pluginDir, { recursive: true, force: true })
    await Lockfile.removeEntry(lockfilePath, pluginId)
  }

  export async function setEnabled(
    pluginId: string,
    enabled: boolean,
    opts: { scope: "global" | "project"; projectDir?: string },
  ): Promise<void> {
    const { scope, projectDir } = opts
    const lockfilePath =
      scope === "project" && projectDir
        ? PluginStorage.projectLockfilePath(projectDir)
        : PluginStorage.globalLockfilePath()

    const data = await Lockfile.read(lockfilePath)
    const entry = data.plugins[pluginId]
    if (!entry) return
    data.plugins[pluginId] = { ...entry, enabled }
    await Lockfile.write(lockfilePath, data)
  }
}
