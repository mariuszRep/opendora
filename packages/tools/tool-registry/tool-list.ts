import z from "zod"
import { Tool } from "../tool.ts"
import { scanAllTools, firstLine } from "./lib/scanner.ts"
import toolDef from "./tool-list.json"

export const ToolListTool = Tool.define("tool_list", {
  description: toolDef.description,
  parameters: z.object({
    query: z.string().optional().describe("Search by tool name, description, or parameter name. Omit to list all tools."),
    group: z.string().optional().describe("Filter to a specific tool group (e.g. communication, filesystem, sessions). Use tool_list with no args to see all group names."),
  }),
  async execute(args, _ctx) {
    const all = await scanAllTools()

    let matches = args.group ? all.filter((t) => t.group === args.group) : all

    if (args.query) {
      const q = args.query.toLowerCase()
      matches = matches
        .map((t) => {
          let score = 0
          if (t.name.includes(q)) score += 10
          if (t.description.toLowerCase().includes(q)) score += 5
          const paramNames = Object.keys(t.inputSchema.properties ?? {})
          if (paramNames.some((p) => p.includes(q))) score += 3
          const paramDescs = Object.values(t.inputSchema.properties ?? {}).map((p: any) => p.description ?? "")
          if (paramDescs.some((d) => d.toLowerCase().includes(q))) score += 1
          return { tool: t, score }
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.tool)
    }

    if (matches.length === 0) {
      return {
        title: "No tools found",
        metadata: { count: 0 },
        output: args.query ? `No tools matched "${args.query}".` : "No tools found.",
      }
    }

    const lines = matches.map((t) => {
      const params = Object.keys(t.inputSchema.properties ?? {}).join(", ") || "none"
      const req = t.inputSchema.required ?? []
      return [
        `name: ${t.name}`,
        `group: ${t.group}`,
        `description: ${firstLine(t.description)}`,
        `parameters: ${params}`,
        `required: ${req.join(", ") || "none"}`,
      ].join("\n")
    })

    return {
      title: args.query ? `Tool search: "${args.query}" (${matches.length} results)` : `All tools (${matches.length})`,
      metadata: { count: matches.length },
      output: lines.join("\n\n"),
    }
  },
})
