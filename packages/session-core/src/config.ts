/**
 * Injectable configuration for @opendora/session-core.
 * Call configure() once at startup before using any session-core functions.
 */

export interface SessionCoreConfig {
  /** Drizzle database instance (drizzle-orm/bun-sqlite) */
  db: any
  /** Global data path (equivalent to Global.Path.data) */
  dataPath: string
  /** Config service */
  config?: {
    get(): Promise<any>
    directories(): Promise<string[]>
  }
  /** Provider service — typed as any until @opendora/provider exists */
  provider?: any // TODO: type properly when Provider is migrated
  /** LSP service */
  lsp?: {
    touchFile(path: string): Promise<void>
    diagnostics(path: string): Promise<any[]>
  }
  /** Bus publish function for session events — defaults to no-op */
  bus?: {
    publish(event: any, payload: any): void
  }
  /** Opencode Bus (for cross-bus bridging) */
  opencodeBus?: {
    publish(eventDef: any, payload: any): void
  }
  /** Snapshot service — typed as any until @opendora/snapshot exists */
  snapshot?: any // TODO: type properly when Snapshot is migrated
  /** Plugin service — typed as any until @opendora/plugin exists */
  plugin?: any // TODO: type properly when Plugin is migrated
  /** Scheduler service — typed as any until @opendora/scheduler exists */
  scheduler?: any // TODO: type properly when Scheduler is migrated
  /** Storage service for reading/writing JSON files */
  storage?: {
    read<T>(key: string[]): Promise<T>
    write<T>(key: string[], value: T): Promise<void>
  }
  /** Instance service — current working directory + project info */
  instance?: {
    directory: string
    worktree: string
    project: {
      id: string
      vcs?: string
    }
  }
  /** Agent service — typed as any until @opendora/agent is fully migrated */
  agent?: any // TODO: type properly when Agent is migrated
  /** PermissionNext service */
  permissionNext?: any // TODO: type properly when Permission is migrated
}

let _config: SessionCoreConfig | null = null

export function configure(config: SessionCoreConfig) {
  _config = config
}

export function getConfig(): SessionCoreConfig {
  if (!_config) throw new Error("@opendora/session-core not configured — call configure() first")
  return _config
}
