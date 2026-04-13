// Stub for openclaw/plugin-sdk/plugin-entry
export interface PluginEntry {
  id: string
  name: string
  version: string
}

export function definePluginEntry(entry: PluginEntry): PluginEntry {
  return entry
}
