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
import { SessionSearchTool, SessionGetTool, SessionTreeTool, SessionUpdateTool } from "./sessions/index.ts"
import { DelegateTool, ReplyTool, QuestionTool, NotifyTool } from "./communication/index.ts"
import { TodoWriteTool, TodoReadTool } from "./system/todo.ts"
import { WebFetchTool, WebSearchTool, CodeSearchTool } from "./browse-and-web/index.ts"
import { InvalidTool } from "./system/invalid.ts"
import { LspTool } from "./system/lsp.ts"
import { SkillLoadTool, SkillListTool, SkillSearchTool, SkillInstallTool, SkillCreateTool, SkillRemoveTool } from "./skills/index.ts"
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
import { WorkflowRunTool } from "./workflows/index.ts"
import { MemoryWriteTool, MemoryReadTool } from "./memory/index.ts"
import type { Tool } from "./tool.ts"
import path from "path"
import { pathToFileURL } from "url"

export interface RegistryConfig {
  clientType: string
  flags: {
    enableQuestion?: boolean
    enableExa?: boolean
    enableLspTool?: boolean
    enablePlanMode?: boolean
    enableBatchTool?: boolean
  }
  getToolDirs?(): Promise<string[]>
  waitForDeps?(): Promise<void>
  loadPlugin?(category: string): Promise<Array<{ id: string; def: unknown }>>
  triggerPlugin?(toolID: string, output: { description: string; parameters: unknown }): Promise<void>
  fromPlugin?(id: string, def: unknown): Tool.Info
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
  let _initialized = false

  export async function init(): Promise<void> {
    if (_initialized) return
    _initialized = true
    _custom = []

    const dirs = (await _config.getToolDirs?.()) ?? []
    if (dirs.length) await _config.waitForDeps?.()

    for (const dir of dirs) {
      const glob = new (globalThis as any).Bun.Glob("{tool,tools}/*.{js,ts}")
      const matches: string[] = [...glob.scanSync({ cwd: dir, dot: true, followSymlinks: true })].map((m: string) =>
        path.join(dir, m),
      )
      for (const match of matches) {
        const namespace = path.basename(match, path.extname(match))
        const mod = await import(pathToFileURL(match).href)
        for (const [id, def] of Object.entries(mod)) {
          if (_config.fromPlugin) {
            _custom.push(_config.fromPlugin(id === "default" ? namespace : `${namespace}_${id}`, def))
          }
        }
      }
    }

    const pluginTools = (await _config.loadPlugin?.("all")) ?? []
    for (const { id, def } of pluginTools) {
      if (_config.fromPlugin) _custom.push(_config.fromPlugin(id, def))
    }
  }

  export function reset(): void {
    _initialized = false
    _custom = []
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
      MemoryWriteTool,
      MemoryReadTool,
      ...(cfg.flags.enableLspTool ? [LspTool] : []),
      ...(cfg.flags.enableBatchTool ? [BatchTool] : []),
      PlaywrightModeTool,
      ...DESKTOP_TOOLS,
      ...PYAUTOGUI_TOOLS,
      ..._custom,
    ]
  }

  export function ids(): string[] {
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
}
