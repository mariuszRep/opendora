/**
 * Server-side wiring for @opendora/tools ToolRegistry: configures it with
 * runtime dependencies (Plugin, Instance, disk-backed truncation) that only
 * make sense once a server process is running.
 */
import { ToolRegistry } from "@opendora/tools/registry"
import { configureRegistry } from "@opendora/tools/registry"
import { configure as configureTruncation } from "@opendora/tools/truncation"
import { Flag } from "@opendora/util/flag"
import { Config } from "@opendora/config/config"
import { Plugin } from "./plugin"
import { Instance } from "@opendora/runtime/instance"
import type { ToolDefinition, ToolContext as PluginToolContext } from "@opencode-ai/plugin"
import { Truncate } from "@opendora/tools/truncation-impl"
import z from "zod"
import type { Tool } from "@opendora/tools/tool"

export { ToolRegistry }

// Wire up real disk-backed truncation for the server runtime.
configureTruncation((text, agent) => Truncate.output(text, {}, agent as any))

// Wire up opencode-specific configuration
configureRegistry({
  clientType: Flag.OPENCODE_CLIENT,
  flags: {
    enableQuestion: Flag.OPENCODE_ENABLE_QUESTION_TOOL,
    enableExa: Flag.OPENCODE_ENABLE_EXA,
    enableLspTool: Flag.OPENCODE_EXPERIMENTAL_LSP_TOOL,
    enablePlanMode: Flag.OPENCODE_EXPERIMENTAL_PLAN_MODE,
    // enableBatchTool is checked dynamically in tools() via Config
    enableBatchTool: false,
  },
  async getToolDirs() {
    return Config.directories()
  },
  async waitForDeps() {
    return Config.waitForDependencies()
  },
  async loadPlugin(_category: string) {
    const plugins = await Plugin.list()
    return plugins.flatMap((plugin: any) =>
      Object.entries(plugin.tool ?? {}).map(([id, def]) => ({ id, def })),
    )
  },
  async triggerPlugin(toolID: string, output: { description: string; parameters: unknown }) {
    await Plugin.trigger("tool.definition", { toolID }, output)
  },
  fromPlugin(id: string, def: unknown): Tool.Info {
    const d = def as ToolDefinition
    return {
      id,
      init: async (initCtx) => ({
        parameters: z.object(d.args),
        description: d.description,
        execute: async (args, ctx) => {
          const pluginCtx = {
            ...ctx,
            directory: Instance.directory,
            worktree: Instance.worktree,
          } as unknown as PluginToolContext
          const result = await d.execute(args as any, pluginCtx)
          const out = await Truncate.output(result, {}, initCtx?.agent as any)
          return {
            title: "",
            output: out.truncated ? out.content : result,
            metadata: { truncated: out.truncated, outputPath: out.truncated ? out.outputPath : undefined },
          }
        },
      }),
    }
  },
})

export { configureRegistry }
