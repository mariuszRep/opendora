import z from "zod"
import fs from "fs/promises"
import path from "path"
import { Tool } from "../tool.ts"
import { findTool } from "./lib/scanner.ts"
import toolDef from "./tool-update.json"

const ALLOWED_PARAM_FIELDS = ["description"] as const

export const ToolUpdateTool = Tool.define("tool_update", {
  description: toolDef.description,
  parameters: z.object({
    name: z.string().describe("Exact tool name/id to update."),
    description: z.string().optional().describe("New top-level description for the tool."),
    parameter_descriptions: z
      .record(z.string(), z.string())
      .optional()
      .describe("Map of parameter name → new description. Only updates description fields — does not change types, required list, or schema structure."),
  }),
  async execute(args, ctx) {
    if (!args.description && !args.parameter_descriptions) {
      return {
        title: "Nothing to update",
        metadata: {},
        output: "Provide at least one of: description, parameter_descriptions.",
      }
    }

    const tool = await findTool(args.name)
    if (!tool) {
      return {
        title: `Tool not found: ${args.name}`,
        metadata: {},
        output: `No tool.json found for "${args.name}". Use tool_list to see available tools.`,
      }
    }

    // Validate parameter names exist in schema
    if (args.parameter_descriptions) {
      const knownParams = Object.keys(tool.inputSchema.properties ?? {})
      const unknown = Object.keys(args.parameter_descriptions).filter((k) => !knownParams.includes(k))
      if (unknown.length) {
        return {
          title: "Unknown parameters",
          metadata: {},
          output: `These parameters do not exist in ${args.name}: ${unknown.join(", ")}\nKnown parameters: ${knownParams.join(", ")}`,
        }
      }
    }

    // Build diff summary for permission prompt
    const changes: string[] = []
    if (args.description && args.description !== tool.description) {
      changes.push(`description: updated (${tool.description.length} → ${args.description.length} chars)`)
    }
    if (args.parameter_descriptions) {
      for (const [param, newDesc] of Object.entries(args.parameter_descriptions)) {
        const oldDesc = (tool.inputSchema.properties?.[param] as any)?.description ?? "(none)"
        changes.push(`parameter "${param}" description: "${oldDesc}" → "${newDesc}"`)
      }
    }

    if (changes.length === 0) {
      return {
        title: "No changes",
        metadata: {},
        output: "The provided values are identical to the current tool.json. Nothing to write.",
      }
    }

    await ctx.ask({
      permission: "tool_update",
      patterns: [args.name],
      always: [],
      metadata: { name: args.name, changes: changes.length },
      explanation: `Update tool metadata for "${args.name}":\n${changes.map((c) => `  • ${c}`).join("\n")}`,
    })

    // Apply changes to a deep copy of the current JSON
    const raw = JSON.parse(await fs.readFile(tool.file, "utf-8"))

    if (args.description) {
      raw.description = args.description
    }

    if (args.parameter_descriptions) {
      raw.inputSchema ??= {}
      raw.inputSchema.properties ??= {}
      for (const [param, newDesc] of Object.entries(args.parameter_descriptions)) {
        raw.inputSchema.properties[param] ??= {}
        raw.inputSchema.properties[param].description = newDesc
      }
    }

    // Atomic write: temp file → rename
    const tmpPath = tool.file + ".tmp"
    await fs.writeFile(tmpPath, JSON.stringify(raw, null, 2) + "\n", "utf-8")
    await fs.rename(tmpPath, tool.file)

    return {
      title: `Updated: ${args.name}`,
      metadata: { name: args.name, file: tool.file, changes: changes.length },
      output: [`tool.json updated for "${args.name}":`, ...changes.map((c) => `  • ${c}`)].join("\n"),
    }
  },
})
