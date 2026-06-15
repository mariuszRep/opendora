import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { findTool } from "./lib/scanner.ts"
import toolDef from "./tool-get.json"

export const ToolGetTool = Tool.define("tool_get", {
  description: toolDef.description,
  parameters: z.object({
    name: z.string().describe("Exact tool name/id (e.g. delegate, session_search, bash)."),
  }),
  async execute(args: { name: string }, ctx): Promise<{ title: string; metadata: Record<string, any>; output: string }> {
    const tool = await findTool(args.name)
    if (!tool) {
      return {
        title: `Tool not found: ${args.name}`,
        metadata: {},
        output: `No tool.json found for "${args.name}". Use tool_list to see available tools.`,
      }
    }

    // Cross-reference: which agents have this tool allocated
    const agents: string[] = []
    try {
      const agentsSvc = host(ctx).agents as any
      if (agentsSvc) {
        const all = (await agentsSvc.list()) as any[]
        for (const agent of all) {
          if (Array.isArray(agent.tools) && agent.tools.includes(args.name)) {
            agents.push(agent.name ?? agent.id)
          }
        }
      }
    } catch {
      // agent service unavailable — proceed without it
    }

    const props = tool.inputSchema.properties ?? {}
    const required = tool.inputSchema.required ?? []

    const paramLines = Object.entries(props).map(([key, val]: [string, any]) => {
      const type = val.enum ? `enum(${val.enum.join("|")})` : (val.type ?? "any")
      const req = required.includes(key) ? " [required]" : " [optional]"
      const desc = val.description ? `\n    ${val.description}` : ""
      return `  ${key}: ${type}${req}${desc}`
    })

    const sections = [
      `name: ${tool.name}`,
      `group: ${tool.group}`,
      `file: ${tool.file}`,
      ``,
      `description:`,
      tool.description,
      ``,
      `parameters:`,
      paramLines.length ? paramLines.join("\n") : "  (none)",
      ``,
      `agents using this tool: ${agents.length ? agents.join(", ") : "none"}`,
    ]

    return {
      title: `tool_get: ${tool.name}`,
      metadata: { name: tool.name, group: tool.group, agents },
      output: sections.join("\n"),
    }
  },
})
