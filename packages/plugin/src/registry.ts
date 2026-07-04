import { PluginScope } from "./scope.js"
import { PluginStorage } from "./storage.js"
import type { Plugin } from "./manifest.js"

export interface CapabilityRecord {
  pluginId: string
  type: Plugin.CapabilityType
  name: string
  sourceGroup: string
  scope: "global" | "project"
  installedDir: string
}

export namespace CapabilityRegistry {
  export async function load(projectDir?: string): Promise<CapabilityRecord[]> {
    const resolved = await PluginScope.resolve(projectDir)
    const records: CapabilityRecord[] = []

    for (const [pluginId, entry] of Object.entries(resolved.effective.plugins)) {
      if (entry.enabled === false) continue

      // installedDir is the capability root (~/.projectflows/), not the plugin bundle dir.
      // Tool registry scans {tool,tools}/*.js from here → ~/.projectflows/tools/*.js
      // Skill scanner uses {skill,skills}/**/SKILL.md from here → ~/.projectflows/skills/
      // Workflow scanner uses workflows/ from here
      const installedDir =
        entry.scope === "project" && projectDir
          ? PluginStorage.projectConfigRoot(projectDir)
          : PluginStorage.globalRoot()

      for (const cap of entry.capabilities) {
        records.push({
          pluginId,
          type: cap.type as Plugin.CapabilityType,
          name: cap.name,
          sourceGroup: cap.sourceGroup || `plugin:${pluginId}`,
          scope: entry.scope,
          installedDir,
        })
      }
    }

    return records
  }

  export async function getInstalledDirs(type: Plugin.CapabilityType, projectDir?: string): Promise<string[]> {
    const records = await load(projectDir)
    const dirs = new Set<string>()
    for (const r of records) {
      if (r.type === type) dirs.add(r.installedDir)
    }
    return Array.from(dirs)
  }

  export async function listCapabilities(
    type?: Plugin.CapabilityType,
    projectDir?: string,
  ): Promise<CapabilityRecord[]> {
    const records = await load(projectDir)
    return type ? records.filter((r) => r.type === type) : records
  }

  export async function getCapability(
    type: Plugin.CapabilityType,
    name: string,
    projectDir?: string,
  ): Promise<CapabilityRecord | null> {
    const records = await load(projectDir)
    const matches = records.filter((r) => r.type === type && r.name === name)
    // PluginScope.merge already applied project-wins; last match from that merge is most specific
    return matches.at(-1) ?? null
  }

  export async function getCapabilitiesBySource(
    sourceGroup: string,
    projectDir?: string,
  ): Promise<CapabilityRecord[]> {
    const records = await load(projectDir)
    return records.filter((r) => r.sourceGroup === sourceGroup)
  }
}
