/**
 * Injectable configuration for @opendora/session.
 * Call configure() once at startup before using any session functions.
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
  provider?: {
    getLanguage(model: any): Promise<any>
    getProvider(providerID: string): Promise<any>
    getModel(providerID: string, modelID: string): Promise<any>
    defaultModel?(): any
    getSmallModel?(providerID: string): Promise<any>
    parseModel?(model: string): { providerID: string; modelID: string }
    ModelNotFoundError?: { isInstance(e: unknown): boolean }
    isWorkerMode?(mode: string): boolean
  }
  /** ProviderTransform service */
  providerTransform?: {
    OUTPUT_TOKEN_MAX: number
    smallOptions(model: any): any
    options(opts: { model: any; sessionID: string; providerOptions?: any }): any
    maxOutputTokens(model: any): number
    temperature(model: any): number | undefined
    topP(model: any): number | undefined
    topK(model: any): number | undefined
    providerOptions(model: any, opts: any): any
    message(prompt: any, model: any, options: any): any
    schema?(model: any, schema: any): any
  }
  /** Ripgrep service */
  ripgrep?: {
    tree(opts: { cwd: string; limit: number }): Promise<string>
  }
  /** LSP service */
  lsp?: {
    touchFile(path: string): Promise<void>
    diagnostics(path: string): Promise<any[]>
    documentSymbol?(uri: string): Promise<any[]>
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
  snapshot?: any
  /** Plugin service */
  plugin?: {
    trigger(event: string, ctx: any, payload: any): Promise<any>
  }
  /** Scheduler service */
  scheduler?: any
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
    containsPath?(p: string): boolean
  }
  /** Agent service */
  agent?: {
    get(name: string): Promise<any>
    getByIdOrName?(id: string): Promise<any>
    defaultAgent?(): Promise<string>
    list?(): Promise<any[]>
    create?(id: string, config: any, persona?: string, injection?: string): Promise<any>
    update?(id: string, patch: any, persona?: string, injection?: string): Promise<any>
    remove?(id: string): Promise<void>
    getInjection?(id: string): Promise<string | undefined>
    isWorkerMode?(mode: string): boolean
  }
  /** PermissionNext service */
  permissionNext?: {
    ask(opts: any): Promise<void>
    disabled(toolNames: string[], permission: any): Set<string>
    merge?(a: any, b: any): any
    evaluate?(permission: string, name: string, ruleset: any): { action: string }
    RejectedError?: any
    Ruleset?: any
  }
  /** Installation version (e.g. "0.1.0") */
  installationVersion?: string
  /** Global config path (equivalent to Global.Path.config) */
  globalConfigPath?: string
  /** Session prompt for executing commands — prevents circular dep from session.ts */
  sessionPrompt?: {
    command(input: any): Promise<void>
  }
  /** Default command name for initialization */
  commandInit?: string
  /** Command service */
  commandDefault?: {
    get(name: string): Promise<any>
    Event?: { Executed: any }
  }
  /** Command bus event */
  commandEvent?: {
    Executed: any
  }
  /** Tool registry */
  toolRegistry?: {
    get(opts: any, agent: any): Promise<Record<string, any>>
    tools?(opts: any, agent: any): Promise<any[]>
  }
  /** MCP service */
  mcp?: {
    get?(sessionID: string, agent: any, model: any, permission: any, abort: AbortSignal): Promise<Record<string, any>>
    tools?(): Promise<Record<string, any>>
    readResource?(clientName: string, uri: string): Promise<any>
  }
  /** Read tool */
  readTool?: {
    init(): Promise<any>
  }
  /** Task tool */
  taskTool?: {
    id?: string
    init?(): Promise<any>
    execute?(args: any, ctx: any): Promise<any>
  }
  /** FileTime service */
  fileTime?: {
    file?(path: string): void
    read?(sessionID: string, path: string): void
  }
  /** Config markdown service */
  configMarkdown?: {
    files?(template: string): any[]
    shell?(template: string): [string, string][]
    generate?(): Promise<string>
  }
  /** Shell service */
  shell?: {
    preferred?(): string
    killTree?(proc: any, opts: { exited: () => boolean }): Promise<void>
    login?(cmd: string, opts?: any): Promise<{ stdout: string; stderr: string; exitCode: number }>
  }
  /** Truncate service */
  truncate?: {
    output?(text: string, opts: any, agent: any): Promise<{ content: string; truncated: boolean; outputPath?: string }>
  }
  /** Skill service */
  skill?: {
    get?(id: string): Promise<any>
    all?(): Promise<any[]>
  }
  /** Session service (for compaction.create, injected to avoid circular dep) */
  session?: {
    updateMessage(msg: any): Promise<any>
    updatePart(part: any): Promise<any>
    messages(opts: { sessionID: string }): Promise<any[]>
  }
  /** Question service — presents questions to the user via the UI */
  question?: {
    ask(params: any): Promise<any[]>
  }
}

let _config: SessionCoreConfig | null = null

export function configure(config: SessionCoreConfig) {
  _config = config
}

export function getConfig(): SessionCoreConfig {
  if (!_config) throw new Error("@opendora/session not configured — call configure() first")
  return _config
}
