export { Plugin } from "./manifest.js"
export { sourceGroupFor, mcpSourceGroupFor, attachSourceGroups } from "./source-group.js"
export { PluginStorage } from "./storage.js"
export { Lockfile } from "./lockfile.js"
export type { LockfileCapability, LockfileEntry, LockfileData } from "./lockfile.js"
export { PluginScope } from "./scope.js"
export type { ResolvedScope } from "./scope.js"
export { checkConflict, PluginConflictError } from "./conflict.js"
export type { ConflictPolicy } from "./conflict.js"
export { configNamespaceFor } from "./config.js"
export type { Plugin as PluginConfig } from "./config.js"
export {
  assertRemovable,
  CORE_SOURCE_GROUPS,
  PluginCoreRequiredError,
  PluginHasDependentsError,
} from "./uninstall.js"
export { LocalPathSource } from "./source.js"
export type { PluginSource, PluginPackage } from "./source.js"
export { PluginInstaller } from "./installer.js"
export type { PluginListItem } from "./installer.js"
export { CapabilityRegistry } from "./registry.js"
export type { CapabilityRecord } from "./registry.js"
