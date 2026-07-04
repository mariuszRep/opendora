import type { LockfileEntry } from "./lockfile.js"

export type ConflictPolicy = "error" | "warn"

export class PluginConflictError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly existingSource: string,
    public readonly incomingSource: string,
  ) {
    super(
      `Plugin "${pluginId}" is already installed from "${existingSource}". Cannot install from "${incomingSource}". Uninstall the existing version first.`,
    )
    this.name = "PluginConflictError"
  }
}

export function checkConflict(
  pluginId: string,
  incoming: { source: string; version: string },
  existing: LockfileEntry,
  policy: ConflictPolicy = "error",
): string | null {
  if (existing.source === incoming.source) return null

  const message = `Plugin "${pluginId}" is already installed from "${existing.source}"; incoming source is "${incoming.source}".`

  if (policy === "error") throw new PluginConflictError(pluginId, existing.source, incoming.source)
  return message
}
