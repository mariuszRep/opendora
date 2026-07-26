/**
 * Configures @projectflows/session with opencode's runtime dependencies.
 * Call once at startup, after the Database is initialized.
 */
import { configure } from "@projectflows/session"
import { Database } from "@projectflows/storage/db"
import { Global } from "@projectflows/util/global"
import { Bus } from "@projectflows/runtime/bus"
import { BusEvent } from "@projectflows/util/bus-event"
import { Config } from "@projectflows/config/config"
import { Storage } from "@projectflows/storage/json-storage"
import { Snapshot } from "@projectflows/runtime/snapshot"
import { Instance } from "@projectflows/runtime/instance"
import { Agent } from "@projectflows/runtime/agent"
import { PermissionNext } from "@projectflows/permission/next"
import { wildcardMatch } from "@projectflows/permission"
import { Plugin } from "./plugin"
import { Scheduler } from "@projectflows/runtime/scheduler"
import { LSP } from "./lsp"
import { Provider } from "@projectflows/provider/provider"
import { ProviderTransform } from "@projectflows/provider/transform"
import { ProviderFallback } from "@projectflows/provider/fallback"
import { ProviderTimeout } from "@projectflows/provider/timeout"
import { ProviderError } from "@projectflows/provider/error"
import { Installation } from "@projectflows/util/installation"
import { ToolRegistry } from "@projectflows/server/tool-registry"
import { MCP } from "./mcp"
import { ReadTool } from "@projectflows/tools/filesystem/read"
import { FileTime } from "@projectflows/tools/file/time"
import { ConfigMarkdown } from "@projectflows/config/markdown"
import { Command } from "@projectflows/server/command"
import { createAgentTargetTool } from "@projectflows/tools/delegation/agent-target"
import { Shell } from "@projectflows/util/shell"
import { Truncate } from "@projectflows/tools/truncation-impl"
import { Skill } from "@projectflows/skills/skill"
import { WorkflowStorage, configurePluginWorkflowDirs } from "@projectflows/workflow/storage"
import { runWorkflow, runWorkflowDetailed } from "@projectflows/workflow/runner"
import { Ripgrep } from "@projectflows/tools/filesystem/lib/ripgrep"
import { SessionPrompt } from "@projectflows/session/prompt"
import { Session } from "@projectflows/session/session"
import { Question } from "@projectflows/runtime/question"
import { Schedule } from "@projectflows/schedule/service"
import { addSkillTools, getSkillTools } from "@projectflows/session/skill-tools"
import { register as registerConfig } from "@projectflows/util/config"
import { register as registerPluginList } from "@projectflows/provider/plugin"
import { CapabilityRegistry } from "@projectflows/plugin"

async function enrichAgent(agent: any): Promise<any> {
  if (!agent?.id) return agent

  // Self-healing registration: make sure every non-system agent's agent__<id> tool exists in
  // the registry whenever any agent actually starts a turn (real request-handling context —
  // see reconcileDelegationTools' doc comment for why this must never run from
  // configureSessionCore's own boot-time body instead).
  await reconcileDelegationTools().catch((err) => {
    console.error("[configureSessionCore] reconcileDelegationTools failed:", err)
  })

  let delegateRules = PermissionNext.listRules("agent", agent.id).filter((r) => r.resource === "agent")

  // Lazy migration: agents saved before the rules-based delegate allowlist existed may still
  // have toolConfig.delegate.allowedAgents populated with zero "agent"-resource rules. Seed
  // rules from the array here, on first use of this agent — awaited as part of the normal
  // per-request flow. (Deliberately NOT done as a proactive scan at server boot: an earlier
  // version did that and it populated Agent.list()'s module-level cache before some tests'
  // agents existed, and since a few callers create agents via AgentCore.create() directly —
  // bypassing packages/runtime/src/agent.ts's invalidateEntries() — that stale cache never
  // got cleared, breaking unrelated defaultAgent() lookups. Seeding here only runs when this
  // specific agent is actually used, same as any other normal Agent.list() call site.)
  if (delegateRules.length === 0) {
    const allowedAgents: string[] | undefined = agent?.config?.toolConfig?.delegate?.allowedAgents
    if (allowedAgents?.length) {
      for (const name of allowedAgents) {
        PermissionNext.addRule({
          scope: "agent",
          scope_id: agent.id,
          resource: "agent",
          access: "execute",
          pattern: name,
          action: "allow",
        })
      }
      delegateRules = PermissionNext.listRules("agent", agent.id).filter((r) => r.resource === "agent")
    }
  }

  // Union delegation targets granted via agent__<id> entries already in agent.tools (the
  // primary, UI-driven grant — see llm.ts filterToolsByAgent, which already honors these
  // directly via declaredTools) with ones matched by permission rules (the rule-derived path,
  // kept for agents whose tools array hasn't been re-saved through the new UI yet). Both are
  // consumed by system.ts's "Available Delegations" section and task.ts's allow/deny pre-check.
  const toolTargetIds = new Set(
    ((agent.tools as string[] | undefined) ?? [])
      .filter((t) => t.startsWith("agent__"))
      .map((t) => t.slice("agent__".length)),
  )
  const allowRules = delegateRules.filter((r) => r.action === "allow")
  if (toolTargetIds.size === 0 && allowRules.length === 0) return { ...agent, delegateRules }

  const all = await Agent.list()
  const delegateAgents = all
    .filter((a) => a.mode !== "system")
    // Match by stable id, not the mutable display `name` — names can be edited freely
    // (and have been, historically) while allowedAgents/rules should stay valid.
    .filter((a) => toolTargetIds.has(a.id) || allowRules.some((r) => wildcardMatch(a.id, r.pattern)))
    .map((a) => ({ id: a.id, name: a.name, description: a.description }))

  return { ...agent, delegateAgents: delegateAgents.length ? delegateAgents : undefined, delegateRules }
}

/**
 * Registers the auto-registered agent__<id> delegation tool for every non-system agent,
 * unconditionally — registration (does the tool exist, is it offered for selection) is decoupled
 * from authorization (can a given caller actually use it, which agent.tools + the underlying
 * "agent"-resource permission rule govern separately, same as any other tool). One tool per
 * target agent, shared across every potential caller — registry size stays O(agents).
 *
 * Only ever call this from real request-handling contexts (route handlers, enrichAgent) — never
 * from configureSessionCore()'s own body. A boot-time Agent.list() call was tried and reverted:
 * it populates packages/runtime/src/agent.ts's module-level entriesCache before some test files'
 * agents exist yet, and since a few callers create agents via AgentCore.create() directly
 * (bypassing that file's own invalidateEntries()), the cache never clears and later
 * defaultAgent() lookups fail with "no primary visible agent found." ToolRegistry.init() is
 * idempotent for a stable instance key, so calling it here first is safe and guarantees
 * dynamically-registered tools survive later init() no-ops.
 */
export async function reconcileDelegationTools() {
  await ToolRegistry.init()
  const all = await Agent.list()

  const existingIds = new Set(
    ToolRegistry.all()
      .map((t) => t.id)
      .filter((id) => id.startsWith("agent__")),
  )
  for (const target of all) {
    if (target.mode === "system") continue
    const toolId = `agent__${target.id}`
    if (!existingIds.has(toolId)) {
      ToolRegistry.register(
        createAgentTargetTool({ id: target.id, name: target.name, description: (target as any).description }),
        "delegation",
      )
    }
    existingIds.delete(toolId)
  }
  // Anything left in existingIds belongs to an agent that no longer exists — remove it.
  for (const staleId of existingIds) {
    ToolRegistry.unregister(staleId)
  }
}

let configured = false

async function syncProviderFallbackGroups() {
  const config = await Config.get()
  ProviderFallback.setCustomGroups(
    (config.model_groups ?? []).map((group: any) => ({
      id: group.id,
      displayName: group.name,
      slots: group.models,
    })),
  )
}

export function configureSessionCore() {
  if (configured) return
  configured = true

  registerConfig(() => Config.get())
  registerPluginList(() => Plugin.list())

  Skill.configurePluginSkillDirs(async () => {
    const projectDir = (() => { try { return Instance.directory } catch { return undefined } })()
    return CapabilityRegistry.getInstalledDirs("skill", projectDir)
  })

  // Agents are installed to ~/.projectflows/agents/ and AgentCore.list() already scans there.
  // No additional plugin dir registration needed — that would duplicate the same path.

  configurePluginWorkflowDirs(async () => {
    const projectDir = (() => { try { return Instance.directory } catch { return undefined } })()
    return CapabilityRegistry.getInstalledDirs("workflow", projectDir)
  })

  configure({
    // Wrap Database.Client() so it's resolved lazily at call time
    get db() {
      return Database.Client()
    },
    dataPath: Global.Path.data,
    providersPath: Global.Path.providers,
    get globalConfigPath() { return Global.Path.config },
    installationVersion: Installation.VERSION,
    opencodeBus: {
      publish(eventDef: any, payload: any) {
        Bus.publish(eventDef, payload)
      },
    },
    bus: {
      publish(eventDef: any, payload: any) {
        Bus.publish(eventDef, payload)
      },
    },
    config: {
      get() {
        return Config.get()
      },
      async directories() {
        return Config.directories()
      },
    },
    storage: {
      read<T>(key: string[]) {
        return Storage.read<T>(key)
      },
      write<T>(key: string[], value: T) {
        return Storage.write(key, value)
      },
    },
    snapshot: {
      track() {
        return Snapshot.track()
      },
      patch(id: string) {
        return Snapshot.patch(id)
      },
      diff(id: string) {
        return Snapshot.diff(id)
      },
      diffFull(from: string, to: string) {
        return Snapshot.diffFull(from, to)
      },
      revert(patches: any[]) {
        return Snapshot.revert(patches)
      },
      restore(id: string) {
        return Snapshot.restore(id)
      },
    },
    get instance() {
      return {
        directory: Instance.directory,
        worktree: Instance.worktree,
        project: Instance.project,
        containsPath(p: string) {
          return Instance.containsPath(p)
        },
      }
    },
    agent: {
      get(name: string) {
        return Agent.get(name)
      },
      getByIdOrName(id: string) {
        return Agent.getByIdOrName(id)
      },
      defaultAgent() {
        return Agent.defaultAgent()
      },
      list() {
        return Agent.list()
      },
      create(id: string, config: any, persona?: string, injection?: string) {
        return Agent.create(id, config, persona, injection)
      },
      update(id: string, patch: any, persona?: string, injection?: string) {
        return Agent.update(id, patch, persona, injection)
      },
      remove(id: string) {
        return Agent.remove(id)
      },
      getInjection(id: string) {
        return Agent.getInjection(id)
      },
      isWorkerMode(mode: string) {
        return Agent.isWorkerMode(mode)
      },
    },
    permissionNext: {
      ask: PermissionNext.ask,
      disabled: PermissionNext.disabled,
      merge(a: any, b: any) {
        return PermissionNext.merge(a, b)
      },
      evaluate(permission: string, name: string, ruleset: any) {
        return PermissionNext.evaluate(permission, name, ruleset) ?? { action: "ask" }
      },
      extractPathBoundaries(ruleset: any) {
        return PermissionNext.extractPathBoundaries(ruleset)
      },
      listRules(scope: string, scope_id: string) {
        return PermissionNext.listRules(scope as any, scope_id)
      },
      wildcardMatch,
      // Expose error classes for instanceof checks in processor.ts
      get RejectedError() {
        return PermissionNext.RejectedError
      },
    },
    plugin: {
      trigger(event: string, ctx: any, payload: any) {
        return Plugin.trigger(event as any, ctx, payload)
      },
    },
    scheduler: Scheduler,
    lsp: {
      async touchFile(path: string) {
        return LSP.touchFile(path)
      },
      async diagnostics(_path: string) {
        return LSP.diagnostics() as any
      },
      async documentSymbol(uri: string) {
        return LSP.documentSymbol(uri)
      },
    },
    // Extra methods (search/glob/files) are used by session via dynamic access;
    // assigned to a variable to bypass excess-property checking on the literal.
    ripgrep: (() => ({
      async tree(opts: { cwd: string; limit: number }) {
        return Ripgrep.tree(opts)
      },
      async search(input: { cwd: string; pattern: string; glob?: string[]; limit?: number; follow?: boolean }) {
        return Ripgrep.search(input)
      },
      async glob(pattern: string, options?: { cwd?: string; include?: "file" | "dir" | "all"; absolute?: boolean; dot?: boolean }) {
        const results: string[] = []
        for await (const file of Ripgrep.files({ cwd: options?.cwd || Instance.directory })) {
          const { minimatch } = await import('minimatch')
          if (minimatch(file, pattern, { dot: options?.dot })) {
            results.push(options?.absolute ? file : file)
          }
        }
        return results
      },
      async *files(options?: { cwd?: string; follow?: boolean; hidden?: boolean; signal?: AbortSignal }) {
        for await (const file of Ripgrep.files({ cwd: options?.cwd || Instance.directory })) {
          yield file
        }
      },
    }))(),
    provider: {
      async getLanguage(model: any) {
        return Provider.getLanguage(model)
      },
      async getProvider(providerID: string) {
        return Provider.getProvider(providerID)
      },
      async getModel(providerID: string, modelID: string) {
        return Provider.getModel(providerID, modelID)
      },
      defaultModel() {
        return Provider.defaultModel()
      },
      async getSmallModel(providerID: string) {
        return Provider.getSmallModel(providerID)
      },
      parseModel(model: string) {
        return Provider.parseModel(model)
      },
      async resolveFallback(groupID: string) {
        await syncProviderFallbackGroups()
        return ProviderFallback.resolve(groupID)
      },
      async reportFallbackError(
        groupID: string,
        slot: { providerID: string; modelID: string },
        statusCode: number | undefined,
        reason: string,
        responseHeaders?: Record<string, string>,
        responseBody?: string,
        errorKind?: string,
      ) {
        await syncProviderFallbackGroups()
        const kind = (errorKind as ProviderError.ErrorKind | undefined) ?? ProviderError.classifyErrorKind(statusCode, reason)
        const result = await ProviderFallback.reportError(groupID, slot, statusCode, reason, responseHeaders, responseBody, kind)
        if (result.providerTimedOut) {
          const info = await ProviderTimeout.getTimeoutInfo(slot.providerID)
          if (info?.timedOut) {
            Bus.publish(BusEvent.ProviderTimedOut, {
              providerID: slot.providerID,
              providerName: slot.providerID,
              reason: info.reason ?? reason,
              resetAt: info.until!,
              resetInSeconds: info.resetInSeconds!,
              failedModels: info.failedModels,
            })
          }
        }
        return result
      },
      async reportProviderTimeout(
        providerID: string,
        modelID: string,
        reason: string,
        responseHeaders?: Record<string, string>,
        responseBody?: string,
        errorKind?: string,
      ) {
        const kind = (errorKind as ProviderError.ErrorKind | undefined) ?? "quota"
        await ProviderTimeout.reportError({ providerID, modelID }, 429, reason, responseHeaders, responseBody, kind)
        const info = await ProviderTimeout.getTimeoutInfo(providerID)
        if (info?.timedOut) {
          Bus.publish(BusEvent.ProviderTimedOut, {
            providerID,
            providerName: providerID,
            reason: info.reason ?? reason,
            resetAt: info.until!,
            resetInSeconds: info.resetInSeconds!,
            failedModels: info.failedModels,
          })
        }
      },
      ModelNotFoundError: {
        isInstance(e: unknown) {
          return Provider.ModelNotFoundError.isInstance(e)
        },
      },
      isWorkerMode(mode: string) {
        return Agent.isWorkerMode(mode)
      },
    },
    providerTransform: {
      get OUTPUT_TOKEN_MAX() {
        return ProviderTransform.OUTPUT_TOKEN_MAX
      },
      smallOptions(model: any) {
        return ProviderTransform.smallOptions(model)
      },
      options(opts: { model: any; sessionID: string; providerOptions?: any }) {
        return ProviderTransform.options(opts)
      },
      maxOutputTokens(model: any) {
        return ProviderTransform.maxOutputTokens(model)
      },
      temperature(model: any) {
        return ProviderTransform.temperature(model)
      },
      topP(model: any) {
        return ProviderTransform.topP(model)
      },
      topK(model: any) {
        return ProviderTransform.topK(model)
      },
      providerOptions(model: any, opts: any) {
        return ProviderTransform.providerOptions(model, opts)
      },
      message(prompt: any, model: any, options: any) {
        return ProviderTransform.message(prompt, model, options)
      },
      schema(model: any, schema: any) {
        return ProviderTransform.schema(model, schema)
      },
    },
    toolRegistry: {
      async get(opts: any, agent: any) {
        const enriched = await enrichAgent(agent)
        const items = await ToolRegistry.tools(opts, enriched)
        return Object.fromEntries(items.map((t: any) => [t.id, t]))
      },
      async tools(opts: any, agent: any) {
        const enriched = await enrichAgent(agent)
        return ToolRegistry.tools(opts, enriched)
      },
    },
    mcp: {
      async get(sessionID: string, agent: any, model: any, sessionPermission: any, abort: AbortSignal) {
        return MCP.tools()
      },
      async tools() {
        return MCP.tools()
      },
      async readResource(clientName: string, uri: string) {
        return MCP.readResource(clientName, uri)
      },
    },
    readTool: {
      async init() {
        return ReadTool.init()
      },
    },
    fileTime: {
      read(sessionID: string, filePath: string) {
        return FileTime.read(sessionID, filePath)
      },
    },
    configMarkdown: {
      files(template: string) {
        return ConfigMarkdown.files(template) as unknown as [string, string][]
      },
      shell(template: string) {
        return ConfigMarkdown.shell(template) as unknown as [string, string][]
      },
    },
    commandInit: Command.Default.INIT,
    commandDefault: {
      async get(name: string) {
        return Command.get(name)
      },
    },
    commandEvent: {
      Executed: Command.Event.Executed,
    },
    shell: {
      preferred() {
        return Shell.preferred()
      },
      async killTree(proc: any, opts: { exited: () => boolean }) {
        return Shell.killTree(proc, opts)
      },
    },
    truncate: {
      async output(text: string, opts: any, agent: any) {
        return Truncate.output(text, opts, agent)
      },
    },
    // Extra methods (create/save/saveConfig) used via dynamic access;
    // IIFE bypasses excess-property checking.
    skill: (() => ({
      async get(id: string) {
        return Skill.get(id)
      },
      async all() {
        return Skill.all()
      },
      async search(query: string, registries?: string[]) {
        return Skill.search(query, registries)
      },
      async install(source: string, options?: any) {
        return Skill.install(source, options)
      },
      async create(params: any) {
        return Skill.create(params)
      },
      async remove(name: string) {
        return Skill.remove(name)
      },
      async save(location: string, content: string) {
        return Skill.save(location, content)
      },
      async saveConfig(name: string, patch: { tools?: string[] }) {
        return Skill.saveConfig(name, patch)
      },
      async list() {
        return Skill.list()
      },
    }))(),
    skillTools: {
      get: (sessionID: string) => getSkillTools(sessionID),
      add: (sessionID: string, tools: string[]) => addSkillTools(sessionID, tools),
    },
    workflow: {
      async list(directory?: string) {
        return WorkflowStorage.list(directory ?? Instance.directory)
      },
      async get(id: string, directory?: string) {
        return WorkflowStorage.get(directory ?? Instance.directory, id)
      },
      async availableIds(directory?: string) {
        return WorkflowStorage.availableIds(directory ?? Instance.directory)
      },
      async run(workflow: any, sessionId: string, input: Record<string, unknown>, directory: string) {
        return runWorkflow({ workflow, sessionId, input, directory })
      },
      async runDetailed(workflow: any, sessionId: string, input: Record<string, unknown>, directory: string) {
        return runWorkflowDetailed({ workflow, sessionId, input, directory })
      },
    },
    // Wire session methods so compaction.create can call them without circular dep.
    // Extra methods beyond the interface are used via dynamic access; IIFE bypasses
    // excess-property checking.
    session: (() => ({
      updateMessage: Session.updateMessage,
      updatePart: Session.updatePart,
      messages: Session.messages,
      get: Session.get,
      list: Session.list,
      children: Session.children,
      setTitle(sessionId: string, title: string) {
        return Session.setTitle({ sessionID: sessionId, title })
      },
      setAgentID(sessionId: string, agentId: string) {
        return Session.setAgentID({ sessionID: sessionId, agentID: agentId })
      },
      setParentSessionID(input: { sessionID: string; parentSessionID: string }) {
        return Session.setParentSessionID(input)
      },
      setSessionStatus(sessionId: string, status: string) {
        return Session.setSessionStatus({ sessionID: sessionId, status: status as any })
      },
      ensureMainSession(agentID: string) {
        return Session.ensureMainSession(agentID)
      },
      createNext(input: any) {
        return Session.createNext(input)
      },
      setCwd(input: { sessionID: string; cwd: string }) {
        return Session.setCwd(input)
      },
    }))(),
    question: {
      ask: Question.ask,
      get RejectedError() {
        return Question.RejectedError
      },
    },
    // Wire sessionPrompt so session.initialize can call it
    sessionPrompt: {
      command: SessionPrompt.command as unknown as (input: any) => Promise<void>,
    },
    schedule: {
      list() {
        return Promise.resolve(Schedule.list())
      },
      get(id: string) {
        return Promise.resolve(Schedule.get(id))
      },
      run(id: string) {
        return Schedule.run(id)
      },
      create(input: any) {
        return Promise.resolve(Schedule.create(input))
      },
      update(id: string, patch: any) {
        return Promise.resolve(Schedule.update(id, patch))
      },
      remove(id: string) {
        Schedule.remove(id)
        return Promise.resolve()
      },
    },
  })
}
