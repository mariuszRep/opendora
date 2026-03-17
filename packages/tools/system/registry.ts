import { PlanExitTool } from "../task-management/plan.ts"
import { QuestionTool } from "../communication/question.ts"
import { BashTool } from "../execution/bash.ts"
import { BatchTool } from "../execution/batch.ts"
import { EditTool } from "../filesystem/edit.ts"
import { WriteTool } from "../filesystem/write.ts"
import { ReadTool } from "../filesystem/read.ts"
import { GlobTool } from "../filesystem/glob.ts"
import { GrepTool } from "../filesystem/grep.ts"
import { ApplyPatchTool } from "../filesystem/apply_patch.ts"
import { CodeSearchTool } from "../filesystem/codesearch.ts"
import { TaskTool } from "../task-management/task.ts"
import { DelegateTool } from "../task-management/delegate.ts"
import { SpawnTool } from "../task-management/spawn.ts"
import { SessionSearchTool } from "../task-management/session-search.ts"
import { SessionSwitchTool } from "../task-management/session-switch.ts"
import { TodoWriteTool, TodoReadTool } from "../task-management/todo.ts"
import { WebFetchTool } from "../communication/webfetch.ts"
import { WebSearchTool } from "../communication/websearch.ts"
import { InvalidTool } from "./invalid.ts"
import { LspTool } from "./lsp.ts"
import { SkillTool, SkillDiscoverTool, SkillLoadTool } from "./skill.ts"
import { AgentCreateTool } from "../agent-manager/agent-create.ts"
import { AgentUpdateTool } from "../agent-manager/agent-update.ts"
import { AgentDeleteTool } from "../agent-manager/agent-delete.ts"
import { AgentListTool } from "../agent-manager/agent-list.ts"
import { AgentGetTool } from "../agent-manager/agent-get.ts"
import type { Tool } from "../tool.ts"
import path from "path"
import { pathToFileURL } from "url"

export interface RegistryConfig {
  /** Current client type: "app" | "cli" | "desktop" | "" */
  clientType: string
  /** Feature flags */
  flags: {
    enableQuestion?: boolean
    enableExa?: boolean
    enableLspTool?: boolean
    enablePlanMode?: boolean
    enableBatchTool?: boolean
  }
  /** Get custom tool directories to scan */
  getToolDirs?(): Promise<string[]>
  /** Wait for custom tool dependencies to load */
  waitForDeps?(): Promise<void>
  /** Load plugin tools: returns array of { id, def } */
  loadPlugin?(category: string): Promise<Array<{ id: string; def: unknown }>>
  /** Trigger a plugin hook on a tool definition */
  triggerPlugin?(toolID: string, output: { description: string; parameters: unknown }): Promise<void>
  /** Convert a plugin tool definition to Tool.Info */
  fromPlugin?(id: string, def: unknown): Tool.Info
}

let _config: RegistryConfig = {
  clientType: "",
  flags: {},
}

export function configure(config: RegistryConfig) {
  _config = config
}

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
      // Use Bun.Glob to scan {tool,tools}/*.{js,ts}
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

  /** Reset initialization state (for testing or re-init) */
  export function reset(): void {
    _initialized = false
    _custom = []
  }

  export function register(tool: Tool.Info) {
    const idx = _custom.findIndex((t) => t.id === tool.id)
    if (idx >= 0) _custom.splice(idx, 1, tool)
    else _custom.push(tool)
  }

  function all(): Tool.Info[] {
    const cfg = _config
    const question = ["app", "cli", "desktop"].includes(cfg.clientType) || cfg.flags.enableQuestion

    return [
      InvalidTool,
      ...(question ? [QuestionTool] : []),
      BashTool,
      ReadTool,
      GlobTool,
      GrepTool,
      EditTool,
      WriteTool,
      TaskTool,
      DelegateTool,
      SpawnTool,
      SessionSearchTool,
      SessionSwitchTool,
      WebFetchTool,
      TodoWriteTool,
      // TodoReadTool,
      WebSearchTool,
      CodeSearchTool,
      SkillDiscoverTool,
      SkillLoadTool,
      ApplyPatchTool,
      AgentCreateTool,
      AgentUpdateTool,
      AgentDeleteTool,
      AgentListTool,
      AgentGetTool,
      ...(cfg.flags.enableLspTool ? [LspTool] : []),
      ...(cfg.flags.enableBatchTool ? [BatchTool] : []),
      ...(cfg.flags.enablePlanMode && cfg.clientType === "cli" ? [PlanExitTool] : []),
      ..._custom,
    ]
  }

  export function ids(): string[] {
    return all().map((t) => t.id)
  }

  export async function tools(
    model: { providerID: string; modelID: string },
    agent?: Tool.AgentInfo,
  ) {
    const tools = all()
    const result = await Promise.all(
      tools
        .filter((t) => {
          if (t.id === "codesearch" || t.id === "websearch") {
            return model.providerID === "opencode" || _config.flags.enableExa
          }
          const usePatch =
            model.modelID.includes("gpt-") &&
            !model.modelID.includes("oss") &&
            !model.modelID.includes("gpt-4")
          if (t.id === "apply_patch") return usePatch
          if (t.id === "edit" || t.id === "write") return !usePatch
          return true
        })
        .map(async (t) => {
          const tool = await t.init({ agent })
          const output = {
            description: tool.description,
            parameters: tool.parameters,
          }
          await _config.triggerPlugin?.(t.id, output)
          return {
            id: t.id,
            ...tool,
            description: output.description,
            parameters: output.parameters,
          }
        }),
    )
    return result
  }
}
