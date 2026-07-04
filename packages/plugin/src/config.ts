import { sourceGroupFor } from "./source-group.js"

export namespace Plugin {
  export interface ConfigNamespace {
    sourceGroup: string
    schema: Record<string, unknown>
    defaults: Record<string, unknown>
  }
}

export function configNamespaceFor(pluginId: string): Plugin.ConfigNamespace {
  return {
    sourceGroup: sourceGroupFor(pluginId),
    schema: {},
    defaults: {},
  }
}
