/**
 * Server-side wiring for @projectflows/tools ToolRegistry: configures it with
 * runtime dependencies (Plugin, Instance, disk-backed truncation) that only
 * make sense once a server process is running.
 */
import { ToolRegistry } from "@projectflows/tools/registry"
import { configureRegistry } from "@projectflows/tools/registry"
import { configure as configureTruncation } from "@projectflows/tools/truncation"
import { Flag } from "@projectflows/util/flag"
import { Config } from "@projectflows/config/config"
import { Plugin } from "./plugin"
import { Instance } from "@projectflows/runtime/instance"
import type { ToolDefinition, ToolContext as PluginToolContext } from "@opencode-ai/plugin"
import { Truncate } from "@projectflows/tools/truncation-impl"
import { CapabilityRegistry } from "@projectflows/plugin"
import z from "zod"
import type { Tool } from "@projectflows/tools/tool"

export { ToolRegistry }

// Wire up real disk-backed truncation for the server runtime.
configureTruncation((text, agent) => Truncate.output(text, {}, agent as any))

// Wire up opencode-specific configuration
configureRegistry({
  clientType: Flag.PROJECTFLOWS_CLIENT,
  getInstanceKey() {
    try { return Instance.directory } catch { return undefined }
  },
  flags: {
    enableQuestion: Flag.PROJECTFLOWS_ENABLE_QUESTION_TOOL,
    enableExa: Flag.PROJECTFLOWS_ENABLE_EXA,
    enableLspTool: Flag.PROJECTFLOWS_EXPERIMENTAL_LSP_TOOL,
    enablePlanMode: Flag.PROJECTFLOWS_EXPERIMENTAL_PLAN_MODE,
    // enableBatchTool is checked dynamically in tools() via Config
    enableBatchTool: false,
  },
  async getToolDirs() {
    const configDirs = (await Config.directories()).map((d) => ({ dir: d, sourceGroup: "core" as const }))
    const projectDir = (() => { try { return Instance.directory } catch { return undefined } })()
    const pluginCaps = await CapabilityRegistry.listCapabilities("tool", projectDir)
    const seen = new Set<string>()
    const pluginDirs: Array<{ dir: string; sourceGroup: string }> = []
    for (const cap of pluginCaps) {
      if (!seen.has(cap.installedDir)) {
        seen.add(cap.installedDir)
        pluginDirs.push({ dir: cap.installedDir, sourceGroup: cap.sourceGroup })
      }
    }
    return [...configDirs, ...pluginDirs]
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
