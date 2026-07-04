import type { Plugin } from "./manifest.js"

export function sourceGroupFor(pluginId: string): string {
  return `plugin:${pluginId}`
}

export function mcpSourceGroupFor(serverId: string): string {
  return `mcp:${serverId}`
}

export function attachSourceGroups(manifest: Plugin.Manifest): Plugin.Manifest {
  const group = sourceGroupFor(manifest.pluginId)
  return {
    ...manifest,
    capabilities: manifest.capabilities.map((cap) =>
      cap.sourceGroup ? cap : { ...cap, sourceGroup: group },
    ),
  }
}
