import type { LockfileData } from "./lockfile.js"

export const CORE_SOURCE_GROUPS = new Set(["core"])

export class PluginCoreRequiredError extends Error {
  constructor(public readonly pluginId: string) {
    super(`Plugin "${pluginId}" provides core-required capabilities and cannot be uninstalled.`)
    this.name = "PluginCoreRequiredError"
  }
}

export class PluginHasDependentsError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly dependents: string[],
  ) {
    super(
      `Plugin "${pluginId}" cannot be uninstalled because the following installed plugins depend on it: ${dependents.join(", ")}.`,
    )
    this.name = "PluginHasDependentsError"
  }
}

export function assertRemovable(pluginId: string, lockfileData: LockfileData): void {
  const entry = lockfileData.plugins[pluginId]
  if (!entry) return

  const hasCoreCapability = entry.capabilities.some((cap) => CORE_SOURCE_GROUPS.has(cap.sourceGroup))
  if (hasCoreCapability) throw new PluginCoreRequiredError(pluginId)

  const dependents = Object.entries(lockfileData.plugins)
    .filter(([id, e]) => id !== pluginId && e.dependencies?.includes(pluginId))
    .map(([id]) => id)

  if (dependents.length > 0) throw new PluginHasDependentsError(pluginId, dependents)
}
