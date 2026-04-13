import type { Tool } from "./tool.ts"

export interface LspDiagnostic {
  message: string
  severity?: number
  range?: { start: { line: number; character: number }; end: { line: number; character: number } }
  source?: string
}

export interface RipgrepSearchResult {
  type: string
  data: unknown
}

export interface RipgrepGlobOptions {
  cwd?: string
  include?: "file" | "dir" | "all"
  absolute?: boolean
  dot?: boolean
  symlink?: boolean
}

export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** Services injected by the host into Tool.Context.extra */
export interface HostServices {
  directory: string
  worktree: string
  lsp?: {
    touchFile(path: string): Promise<void>
    diagnostics(path: string): Promise<LspDiagnostic[]>
    diagnosticsAll?(): Promise<Record<string, LspDiagnostic[]>>
    hasClients?(path: string): Promise<boolean>
    definition?(position: { file: string; line: number; character: number }): Promise<unknown[]>
    references?(position: { file: string; line: number; character: number }): Promise<unknown[]>
    hover?(position: { file: string; line: number; character: number }): Promise<unknown[]>
    documentSymbol?(uri: string): Promise<unknown[]>
    workspaceSymbol?(query: string): Promise<unknown[]>
    implementation?(position: { file: string; line: number; character: number }): Promise<unknown[]>
    prepareCallHierarchy?(position: { file: string; line: number; character: number }): Promise<unknown[]>
    incomingCalls?(position: { file: string; line: number; character: number }): Promise<unknown[]>
    outgoingCalls?(position: { file: string; line: number; character: number }): Promise<unknown[]>
  }
  emit?: (type: string, payload: unknown) => void
  ripgrep?: {
    search(args: string[], options?: { cwd?: string }): Promise<RipgrepSearchResult[]>
    glob(pattern: string, options?: RipgrepGlobOptions): Promise<string[]>
    files(options?: { cwd?: string; follow?: boolean; hidden?: boolean; signal?: AbortSignal }): AsyncIterable<string>
  }
  shell?: {
    login(cmd: string[], options?: { directory?: string; worktree?: string }): Promise<ShellResult>
  }
  pluginTrigger?: (hook: string, context: unknown, output: unknown) => Promise<void>
  session?: {
    list(filter?: unknown): Promise<unknown[]>
    children(sessionId: string): Promise<unknown[]>
    messages(sessionId: string): Promise<unknown[]>
    get(sessionId: string): Promise<unknown | undefined>
    getMessage(messageId: string): Promise<{ id: string; session_id: string } | null>
    setTitle(sessionId: string, title: string): Promise<void>
    setReplyToSessionID?(input: { sessionID: string; replyToSessionID: string }): Promise<unknown>
    reply?(input: { sessionID: string; agentID: string; message: string; parentMessageID?: string }): Promise<unknown>
    pong(sessionId: string, opts: { from: { kind: string; id: string }; content: string; parent: { messageId: string } | null }): Promise<void>
  }
  prompt?: (options: unknown) => Promise<unknown>
  promptCancel?: (sessionId: string) => void
  resolvePromptParts?: (prompt: string) => Promise<unknown>
  question?: (params: unknown) => Promise<string>
  agents?: {
    list(): Promise<unknown[]>
    get(id: string): Promise<unknown | undefined>
    getInjection?(id: string): Promise<string>
    create(id: string, config: unknown, persona?: string, injection?: string): Promise<void>
    update(id: string, patch: unknown, persona?: string, injection?: string): Promise<void>
    remove(id: string): Promise<void>
  }
  skills?: {
    run(name: string, prompt: string, context: unknown): Promise<string>
    all(): Promise<Array<{ name: string; description: string; location: string; content: string }>>
    get(name: string): Promise<{ name: string; description: string; location: string; content: string } | undefined>
    search?(query: string, registries?: string[]): Promise<Array<{ name: string; description: string; source: string; sourceType: string; registry: string }>>
    install?(source: string, options?: { registry?: string; version?: string; force?: boolean }): Promise<void>
    update?(name: string): Promise<void>
    uninstall?(name: string): Promise<void>
    list?(): Promise<Array<{ name: string; version: string; source: string; sourceType: string }>>
  }
  config?: {
    get(): Promise<unknown>
    directories(): Promise<string[]>
  }
  flags?: Record<string, string | boolean>
  instructionPrompt?: (sessionId: string, messages: unknown[], filepath: string, messageID: string) => Promise<Array<{ filepath: string; content: string }>>
  todo?: {
    list(sessionId: string): Promise<unknown[]>
    write(sessionId: string, items: unknown[]): Promise<void>
  }
  snapshot?: unknown
  disableFiletimeCheck?: boolean
  containsPath?: (p: string) => boolean
  /** Write boundary: absolute path the session is hard-locked to; undefined = no restriction */
  allowedPaths?: string[]
  /** Read boundary: absolute path outside which reads require user approval; undefined = same as allowedPaths */
  readPath?: string
}

/** Get host services from tool context */
export function host(ctx: Tool.Context): HostServices {
  return (ctx.extra ?? {}) as HostServices
}

export function directory(ctx: Tool.Context): string {
  const h = host(ctx)
  if (!h.directory) throw new Error("Tool context is missing 'directory'")
  return h.directory
}

export function worktree(ctx: Tool.Context): string {
  const h = host(ctx)
  if (!h.worktree) throw new Error("Tool context is missing 'worktree'")
  return h.worktree
}
