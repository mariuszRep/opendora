/**
 * Configures @opendora/session with opencode's runtime dependencies.
 * Call once at startup, after the Database is initialized.
 */
import { configure } from "@opendora/session"
import { Database } from "@opendora/storage/db"
import { Global } from "@opendora/util/global"
import { Bus } from "@opendora/runtime/bus"
import { BusEvent } from "@opendora/util/bus-event"
import { Config } from "@opendora/config/config"
import { Storage } from "@opendora/storage/json-storage"
import { Snapshot } from "@opendora/runtime/snapshot"
import { Instance } from "@opendora/runtime/instance"
import { Agent } from "@opendora/opencode/agent"
import { PermissionNext } from "@opendora/opencode/permission/next"
import { Plugin } from "@opendora/opencode/plugin"
import { Scheduler } from "@opendora/runtime/scheduler"
import { LSP } from "./lsp"
import { Provider } from "@opendora/provider/provider"
import { ProviderTransform } from "@opendora/provider/transform"
import { ProviderFallback } from "@opendora/provider/fallback"
import { ProviderTimeout } from "@opendora/provider/timeout"
import { ProviderError } from "@opendora/provider/error"
import { Installation } from "@opendora/opencode/installation"
import { ToolRegistry } from "@opendora/opencode/tool/registry"
import { MCP } from "./mcp"
import { ReadTool } from "@opendora/tools/filesystem"
import { FileTime } from "@opendora/opencode/file/time"
import { ConfigMarkdown } from "@opendora/config/markdown"
import { Command } from "@opendora/opencode/command"
import { TaskTool } from "@opendora/opencode/tool/task"
import { Shell } from "@opendora/util/shell"
import { Truncate } from "@opendora/opencode/tool/truncation"
import { Skill } from "@opendora/opencode/skill"
import { WorkflowStorage } from "@opendora/workflow/storage"
import { Ripgrep } from "@opendora/tools/filesystem/lib/ripgrep"
import { SessionPrompt } from "@opendora/session/prompt"
import { Session } from "@opendora/session/session"
import { Question } from "@opendora/runtime/question"
import { Schedule } from "@opendora/opencode/schedule"
import { addSkillTools, getSkillTools } from "@opendora/session/skill-tools"
import { register as registerConfig } from "@opendora/util/config"
import { register as registerPluginList } from "@opendora/provider/plugin"

async function enrichAgent(agent: any): Promise<any> {
  const allowedAgents: string[] | undefined = agent?.config?.toolConfig?.delegate?.allowedAgents
  if (!allowedAgents || allowedAgents.length === 0) return agent
  const all = await Agent.list()
  const delegateAgents = all
    .filter((a) => allowedAgents.includes(a.name))
    .filter((a) => a.mode !== "system")
    .map((a) => ({ name: a.name, description: a.description }))
  return { ...agent, delegateAgents }
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

  configure({
    // Wrap Database.Client() so it's resolved lazily at call time
    get db() {
      return Database.Client()
    },
    dataPath: Global.Path.data,
    providersPath: Global.Path.providers,
    globalConfigPath: Global.Path.config,
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
    taskTool: {
      id: TaskTool.id,
      async init() {
        return TaskTool.init()
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
