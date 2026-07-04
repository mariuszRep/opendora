import fs from "fs/promises"
import path from "path"
import { attachSourceGroups } from "./source-group.js"
import { PluginStorage } from "./storage.js"
import { Lockfile, type LockfileEntry } from "./lockfile.js"
import { PluginScope } from "./scope.js"
import { checkConflict, type ConflictPolicy } from "./conflict.js"
import { assertRemovable } from "./uninstall.js"
import { LocalPathSource } from "./source.js"

export interface PluginListItem extends LockfileEntry {
  pluginId: string
  enabled: boolean
}

// Subdirectories inside a plugin source that are extracted to the capability root.
const CAP_SUBDIRS = ["agents", "skills", "tools"] as const

async function extractCapabilities(sourcePath: string, capRoot: string): Promise<void> {
  for (const subdir of CAP_SUBDIRS) {
    const src = path.join(sourcePath, subdir)
    const dest = path.join(capRoot, subdir)
    let entries: fs.Dirent[]
    try {
      entries = await fs.readdir(src, { withFileTypes: true })
    } catch {
      continue // subdir doesn't exist in this plugin — fine
    }
    await fs.mkdir(dest, { recursive: true })
    for (const entry of entries) {
      const destEntry = path.join(dest, entry.name)
      if (subdir !== "tools") {
        // Agents and skills: skip if already on disk. Preserves user customizations
        // and respects intentional deletes (e.g. user removed the "build" agent).
        const exists = await fs.access(destEntry).then(() => true).catch(() => false)
        if (exists) continue
      }
      await fs.cp(path.join(src, entry.name), destEntry, { recursive: true })
    }
  }
}

async function removeCapabilities(capabilities: LockfileEntry["capabilities"], capRoot: string): Promise<void> {
  for (const cap of capabilities) {
    if (cap.type === "agent") {
      await fs.rm(path.join(capRoot, "agents", cap.name), { recursive: true, force: true })
    } else if (cap.type === "skill") {
      await fs.rm(path.join(capRoot, "skills", cap.name), { recursive: true, force: true })
    } else if (cap.type === "tool") {
      for (const ext of [".js", ".ts"]) {
        await fs.rm(path.join(capRoot, "tools", `${cap.name}${ext}`), { force: true }).catch(() => {})
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

    // Capability root: ~/.projectflows/ (agents/skills/tools land here as subdirs)
    const capRoot =
      scope === "project" && projectDir
        ? PluginStorage.projectConfigRoot(projectDir)
        : PluginStorage.globalRoot()

    await fs.mkdir(pluginDir, { recursive: true })
    await fs.cp(sourcePath, pluginDir, { recursive: true })

    // Extract agents/, skills/, tools/ into the capability root
    await extractCapabilities(sourcePath, capRoot)

    const lockfilePath =
      scope === "project" && projectDir
        ? PluginStorage.projectLockfilePath(projectDir)
        : PluginStorage.globalLockfilePath()

    const entry: LockfileEntry = {
      version,
      source: sourcePath,
      scope,
      installedAt: new Date().toISOString(),
      capabilities: capabilities.map((cap) => ({
        type: cap.type,
        name: cap.name,
        sourceGroup: cap.sourceGroup ?? `plugin:${pluginId}`,
      })),
      enabled: true,
      ...(dependencies && { dependencies }),
      ...(configSchema && { configSchema }),
    }

    await Lockfile.addEntry(lockfilePath, pluginId, entry)
    return { pluginId, ...entry, enabled: true }
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

    // Remove extracted capabilities (agents/skills/tools)
    const entry = data.plugins[pluginId]
    if (entry) {
      await removeCapabilities(entry.capabilities, capRoot)
    }

    // Remove plugin bundle dir
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
