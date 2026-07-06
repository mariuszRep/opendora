import path from "path"
import { Global } from "@projectflows/util/global"

export namespace PluginStorage {
  // Global config root: ~/.projectflows/
  // Agents, skills, tools, and plugins are subfolders here.
  export function globalRoot(): string {
    return Global.Path.config
  }

  // Plugin bundle dir: ~/.projectflows/plugins/<id>/
  export function globalPluginDir(pluginId: string): string {
    return path.join(globalRoot(), "plugins", pluginId)
  }

  // Backward-compat alias — callers should migrate to globalPluginDir
  export function globalInstalledDir(pluginId: string): string {
    return globalPluginDir(pluginId)
  }

  export function globalLockfilePath(): string {
    return path.join(globalRoot(), "plugins.lock.json")
  }

  // Project config root: <projectDir>/.projectflows/
  export function projectConfigRoot(projectDir: string): string {
    return path.join(projectDir, ".projectflows")
  }

  // Plugin bundle dir (project-scoped): <projectDir>/.projectflows/plugins/<id>/
  export function projectPluginDir(pluginId: string, projectDir: string): string {
    return path.join(projectConfigRoot(projectDir), "plugins", pluginId)
  }

  // Backward-compat alias
  export function projectInstalledDir(pluginId: string, projectDir: string): string {
    return projectPluginDir(pluginId, projectDir)
  }

  export function projectLockfilePath(projectDir: string): string {
    return path.join(projectConfigRoot(projectDir), "plugins.lock.json")
  }

  // Used by PluginScope — keeps legacy path name
  export function projectRoot(projectDir: string): string {
    return path.join(projectConfigRoot(projectDir), "plugins")
  }

  // Tool-group layout helpers — ~/.projectflows/tool-groups/<groupId>/
  export function toolGroupsDir(capRoot: string): string {
    return path.join(capRoot, "tool-groups")
  }

  export function toolGroupDir(capRoot: string, groupId: string): string {
    return path.join(capRoot, "tool-groups", groupId)
  }

  export function toolGroupManifestPath(capRoot: string, groupId: string): string {
    return path.join(capRoot, "tool-groups", groupId, "group.json")
  }

  export function toolGroupToolsDir(capRoot: string, groupId: string): string {
    return path.join(capRoot, "tool-groups", groupId, "tools")
  }

  // Convenience: resolve the right install dir for a given scope
  export function installedDir(pluginId: string, scope: "global"): string
  export function installedDir(pluginId: string, scope: "project", projectDir: string): string
  export function installedDir(pluginId: string, scope: "global" | "project", projectDir?: string): string {
    if (scope === "project") {
      if (!projectDir) throw new Error("projectDir required for project scope")
      return projectPluginDir(pluginId, projectDir)
    }
    return globalPluginDir(pluginId)
  }
}
