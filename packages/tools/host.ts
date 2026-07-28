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
    setAgentID?(sessionId: string, agentId: string): Promise<void>
    setParentSessionID?(input: { sessionID: string; parentSessionID: string }): Promise<unknown>
    setSessionStatus?(sessionId: string, status: string): Promise<void>
    /**
     * Live busy/idle/retry state — NOT the persisted sessionStatus field above.
     * Must go through the host (not a direct package import) because installed
     * registry tools get bundled with their dependencies inlined at publish time;
     * a direct import of the status module would read a disconnected copy of its
     * in-memory state, not the live server's.
     */
    getStatus?(sessionId: string): Promise<{ type: "idle" | "busy" | "retry"; attempt?: number; message?: string; next?: number }>
    setReplyToSessionID?(input: { sessionID: string; replyToSessionID: string }): Promise<unknown>
    reply?(input: { sessionID: string; agentID: string; message: string; parentMessageID?: string }): Promise<unknown>
    pong(sessionId: string, opts: { from: { kind: string; id: string }; content: string; parent: { messageId: string } | null }): Promise<void>
    ensureMainSession?(agentID: string): Promise<{ id: string; [k: string]: unknown }>
  }
  prompt?: (options: unknown) => Promise<unknown>
  promptCancel?: (sessionId: string) => void
  resolvePromptParts?: (prompt: string) => Promise<unknown>
  /** Durable delegation records — see packages/session/src/delegation.ts */
  delegation?: {
    record(input: {
      askerSessionID: string
      askerMessageID?: string
      childSessionID: string
      childMessageID: string
      agent: string
      description?: string
      mode: "sync" | "async"
      toolCallID?: string
      resultSchema?: unknown
    }): string
    finalizeSync(
      edgeID: string,
      input: { state: "completed" | "error" | "incomplete" | "cancelled"; result?: string; reason?: string },
    ): void
    countPendingForAsker(askerSessionID: string): number
  }
  question?: (params: unknown) => Promise<string[][]>
  agents?: {
    list(): Promise<unknown[]>
    get(id: string): Promise<unknown | undefined>
    getInjection?(id: string): Promise<string>
    create(id: string, config: unknown, persona?: string, injection?: string): Promise<void>
    update(id: string, patch: unknown, persona?: string, injection?: string): Promise<void>
    remove(id: string): Promise<void>
  }
  /** Per-session registry for tools unlocked via skill_load */
  skillTools?: {
    get(sessionID: string): Set<string>
    add(sessionID: string, tools: string[]): void
  }
  skills?: {
    run(name: string, prompt: string, context: unknown): Promise<string>
    all(): Promise<Array<{ name: string; description: string; location: string; content: string; origin?: string; tools?: string[] }>>
    get(name: string): Promise<{ name: string; description: string; location: string; content: string; origin?: string; tools?: string[] } | undefined>
    search?(query: string, registries?: string[]): Promise<Array<{ name: string; description: string; source: string; sourceType: string; registry: string }>>
    install?(source: string, options?: { registry?: string; version?: string; force?: boolean }): Promise<void>
    create?(params: { name: string; description: string; tools?: string[]; content?: string }): Promise<{ dir: string }>
    remove?(name: string): Promise<void>
    save?(location: string, content: string): Promise<void>
    saveConfig?(name: string, patch: { tools?: string[] }): Promise<void>
    update?(name: string): Promise<void>
    uninstall?(name: string): Promise<void>
    list?(): Promise<Array<{ name: string; version: string; source: string; sourceType: string }>>
  }
  schedule?: {
    list(): Promise<unknown[]>
    get(id: string): Promise<unknown | undefined>
    run(id: string): Promise<void>
    create(input: {
      prompt: string
      cron_expression: string
      agent_id?: string
      session_id?: string
      name?: string
      color?: string
      timezone?: string
      action_type?: "message" | "tool"
      tool_name?: string
    }): Promise<unknown>
    update(id: string, patch: {
      is_active?: boolean
      cron_expression?: string
      prompt?: string
      timezone?: string
      action_type?: "message" | "tool"
      tool_name?: string
      agent_id?: string | null
      session_id?: string | null
      name?: string | null
      color?: string | null
    }): Promise<unknown | undefined>
    remove(id: string): Promise<void>
  }
  config?: {
    get(): Promise<unknown>
    directories(): Promise<string[]>
  }
  /** Wired in prompt.ts's resolveTools and workflow-tool-executor.ts; was previously used only via an `as any` cast. */
  workflow?: {
    get(id: string): Promise<unknown | undefined>
    availableIds?(): Promise<string[]>
    run(workflow: unknown, sessionId: string, input: Record<string, unknown>, directory: string): Promise<string>
    runDetailed(
      workflow: unknown,
      sessionId: string,
      input: Record<string, unknown>,
      directory: string,
    ): Promise<{ display: string; outputObject: any }>
    /** Runs an ad-hoc, never-persisted node/edge snippet through the real engine — no checkpoints, no WorkflowStorage — so a node (or a few) can be tested before it's added to a real workflow. */
    sandboxRun?(
      workflow: unknown,
      sessionId: string,
      input: Record<string, unknown>,
      directory: string,
      seedCtx?: Record<string, unknown>,
    ): Promise<{ display: string; outputObject: any }>
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
