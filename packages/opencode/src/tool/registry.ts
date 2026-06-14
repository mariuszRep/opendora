/**
 * Thin opencode wrapper around @opendora/tools ToolRegistry.
 * Configures it with opencode-specific runtime dependencies.
 */
import { ToolRegistry } from "@opendora/tools/registry"
import { configureRegistry } from "@opendora/tools/registry"
import { Flag } from "@/flag/flag"
import { Config } from "@/config/config"
import { Plugin } from "@/plugin"
import { Instance } from "@/project/instance"
import type { ToolDefinition, ToolContext as PluginToolContext } from "@opencode-ai/plugin"
import { Truncate } from "./truncation"
import z from "zod"
import type { Tool } from "./tool"

export { ToolRegistry }

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
    return plugins.flatMap((plugin) =>
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
