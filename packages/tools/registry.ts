import { BashTool } from "./shell/bash.ts"
import { BatchTool } from "./shell/batch.ts"
import { EditTool } from "./filesystem/edit.ts"
import { WriteTool } from "./filesystem/write.ts"
import { ReadTool } from "./filesystem/read.ts"
import { ListTool } from "./filesystem/ls.ts"
import { GlobTool } from "./filesystem/glob.ts"
import { GrepTool } from "./filesystem/grep.ts"
import { MultiEditTool } from "./filesystem/multiedit.ts"
import { ApplyPatchTool } from "./filesystem/apply_patch.ts"
import { SessionSearchTool, SessionGetTool, SessionAnalyzeTool, SessionTreeTool, SessionUpdateTool } from "./sessions/index.ts"
import { DelegateTool, ReplyTool, QuestionTool, NotifyTool } from "./communication/index.ts"
import { TodoWriteTool, TodoReadTool } from "./system/todo.ts"
import { WebFetchTool, WebSearchTool, CodeSearchTool } from "./browse-and-web/index.ts"
import { InvalidTool } from "./system/invalid.ts"
import { LspTool } from "./system/lsp.ts"
import { SkillLoadTool, SkillListTool, SkillSearchTool, SkillInstallTool, SkillCreateTool, SkillEditTool, SkillRemoveTool } from "./skills/index.ts"
import { LogLessonTool } from "./system/log-lesson.ts"
import { AgentCreateTool } from "./agents/agent-create.ts"
import { AgentUpdateTool } from "./agents/agent-update.ts"
import { AgentDeleteTool } from "./agents/agent-delete.ts"
import { AgentListTool } from "./agents/agent-list.ts"
import { AgentGetTool } from "./agents/agent-get.ts"
import { ScheduleListTool, ScheduleCreateTool, ScheduleUpdateTool, ScheduleDeleteTool, ScheduleGetTool, ScheduleRunTool } from "./schedule/index.ts"
import { DESKTOP_TOOLS } from "./desktop/index.ts"
import { PYAUTOGUI_TOOLS } from "./pyautogui/index.ts"
import { PlaywrightModeTool } from "./browser/playwright-mode.ts"
import { ToolListTool, ToolGetTool, ToolUpdateTool } from "./tool-registry/index.ts"
import { WorkflowRunTool, WorkflowParametersTool, WorkflowCreateTool, WorkflowGetTool, WorkflowListTool, WorkflowUpdateTool, WorkflowDeleteTool, WorkflowNodeCatalogTool } from "./workflows/index.ts"
import { MemoryWriteTool, MemoryReadTool, MemoryDeleteTool } from "./memory/index.ts"
import { toJSONSchema } from "zod"
import type { Tool } from "./tool.ts"
import path from "path"
import { pathToFileURL } from "url"

export type ToolDirEntry = string | { dir: string; sourceGroup: string }

export interface RegistryConfig {
  clientType: string
  flags: {
    enableQuestion?: boolean
    enableExa?: boolean
    enableLspTool?: boolean
    enablePlanMode?: boolean
    enableBatchTool?: boolean
  }
  getToolDirs?(): Promise<ToolDirEntry[]>
  waitForDeps?(): Promise<void>
  loadPlugin?(category: string): Promise<Array<{ id: string; def: unknown; sourceGroup?: string }>>
  triggerPlugin?(toolID: string, output: { description: string; parameters: unknown }): Promise<void>
  fromPlugin?(id: string, def: unknown): Tool.Info
  /** Returns a key that uniquely identifies the current instance; init() re-runs when the key changes. */
  getInstanceKey?(): string | undefined
}

let _config: RegistryConfig = {
  clientType: "",
  flags: {},
}

export function configure(config: RegistryConfig) {
  _config = config
}

export const configureRegistry = configure

export namespace ToolRegistry {
  let _custom: Tool.Info[] = []
  let _sourceGroups = new Map<string, string>() // toolId → sourceGroup
  let _initialized = false
  let _instanceKey: string | undefined = undefined

  export async function init(): Promise<void> {
    const key = _config.getInstanceKey?.()
    if (_initialized && key === _instanceKey) return
    _initialized = true
    _instanceKey = key
    _custom = []
    _sourceGroups = new Map()

    const dirEntries = (await _config.getToolDirs?.()) ?? []
    if (dirEntries.length) await _config.waitForDeps?.()

    for (const entry of dirEntries) {
      const dir = typeof entry === "string" ? entry : entry.dir
      const sg = typeof entry === "string" ? "core" : (entry.sourceGroup ?? "core")
      const glob = new (globalThis as any).Bun.Glob("{tool,tools}/*.{js,ts}")
      const matches: string[] = [...glob.scanSync({ cwd: dir, dot: true, followSymlinks: true })].map((m: string) =>
        path.join(dir, m),
      )
      for (const match of matches) {
        const namespace = path.basename(match, path.extname(match))
        const mod = await import(pathToFileURL(match).href).catch(() => null)
        if (!mod) continue
        for (const [id, def] of Object.entries(mod)) {
          if (_config.fromPlugin) {
            const toolId = id === "default" ? namespace : `${namespace}_${id}`
            _custom.push(_config.fromPlugin(toolId, def))
            _sourceGroups.set(toolId, sg)
          }
        }
      }
    }

    const pluginTools = (await _config.loadPlugin?.("all")) ?? []
    for (const { id, def, sourceGroup } of pluginTools) {
      if (_config.fromPlugin) _custom.push(_config.fromPlugin(id, def))
      _sourceGroups.set(id, sourceGroup ?? "core")
    }
  }

  export function reset(): void {
    _initialized = false
    _custom = []
    _sourceGroups = new Map()
  }

  export function register(tool: Tool.Info) {
    const idx = _custom.findIndex((t) => t.id === tool.id)
    if (idx >= 0) _custom.splice(idx, 1, tool)
    else _custom.push(tool)
  }

  export function all(): Tool.Info[] {
    const cfg = _config
    const question = ["app", "cli", "desktop"].includes(cfg.clientType) || cfg.flags.enableQuestion

    return [
      InvalidTool,
      ...(question ? [QuestionTool] : []),
      BashTool,
      ReadTool,
      ListTool,
      GlobTool,
      GrepTool,
      EditTool,
      MultiEditTool,
      WriteTool,
      DelegateTool,
      SessionSearchTool,
      SessionGetTool,
      SessionAnalyzeTool,
      SessionTreeTool,
      SessionUpdateTool,
      ReplyTool,
      NotifyTool,
      WebFetchTool,
      TodoWriteTool,
      // TodoReadTool,
      WebSearchTool,
      CodeSearchTool,
      SkillListTool,
      SkillLoadTool,
      SkillSearchTool,
      SkillInstallTool,
      SkillCreateTool,
      SkillEditTool,
      SkillRemoveTool,
      LogLessonTool,
      ApplyPatchTool,
      AgentCreateTool,
      AgentUpdateTool,
      AgentDeleteTool,
      AgentListTool,
      AgentGetTool,
      ScheduleListTool,
      ScheduleCreateTool,
      ScheduleUpdateTool,
      ScheduleDeleteTool,
      ScheduleGetTool,
      ScheduleRunTool,
      ToolListTool,
      ToolGetTool,
      ToolUpdateTool,
      WorkflowRunTool,
      WorkflowParametersTool,
      WorkflowCreateTool,
      WorkflowGetTool,
      WorkflowListTool,
      WorkflowUpdateTool,
      WorkflowDeleteTool,
      WorkflowNodeCatalogTool,
      MemoryWriteTool,
      MemoryReadTool,
      MemoryDeleteTool,
      ...(cfg.flags.enableLspTool ? [LspTool] : []),
      ...(cfg.flags.enableBatchTool ? [BatchTool] : []),
      PlaywrightModeTool,
      ...DESKTOP_TOOLS,
      ...PYAUTOGUI_TOOLS,
      ..._custom,
    ]
  }

  export async function ids(): Promise<string[]> {
    await init()
    return all().map((t) => t.id)
  }

  export async function tools(model: { providerID: string; modelID: string }, agent?: Tool.AgentInfo) {
    const result = await Promise.all(
      all()
        .filter((t) => {
          const usePatch = model.modelID.includes("gpt-") && !model.modelID.includes("oss") && !model.modelID.includes("gpt-4")
          if (t.id === "apply_patch") return usePatch
          if (t.id === "edit" || t.id === "write") return !usePatch
          return true
        })
        .map(async (t) => {
          const tool = await t.init({ agent, model })
          const output = { description: tool.description, parameters: tool.parameters }
          await _config.triggerPlugin?.(t.id, output)
          return { id: t.id, ...tool, description: output.description, parameters: output.parameters }
        }),
    )
    return result
  }

  export interface ToolSchemaEntry {
    id: string
    description: string
    source: "internal"
    sourceGroup: string
    inputSchema: Record<string, unknown>
  }

  export async function schemas(model = { providerID: "anthropic", modelID: "claude-sonnet-4-6" }): Promise<ToolSchemaEntry[]> {
    return Promise.all(
      all().map(async (t) => {
        const sg = _sourceGroups.get(t.id) ?? "core"
        try {
          const tool = await t.init({ model })
          const params = tool.parameters as any
          // Zod v4 uses .def; v3 uses ._def — detect which we have
          const isZodSchema = params?.def !== undefined || params?._def !== undefined
          const inputSchema = isZodSchema
            ? toJSONSchema(params)
            : (params ?? { type: "object", properties: {} })
          return { id: t.id, description: tool.description, source: "internal" as const, sourceGroup: sg, inputSchema: inputSchema as Record<string, unknown> }
        } catch {
          return { id: t.id, description: "", source: "internal" as const, sourceGroup: sg, inputSchema: { type: "object", properties: {} } }
        }
      }),
    )
  }
}
