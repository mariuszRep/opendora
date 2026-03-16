import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"

export const AgentListTool = Tool.define(
  "agent_list",
  async (initCtx) => ({
    description: "List all available agents with their configurations. This allows agents to discover what agents exist and their properties.",
    parameters: z.object({
      mode: z.enum(["subagent", "primary", "all", "worker", "system"]).optional().describe("Optional filter by agent mode. If not provided, returns all agents regardless of their mode setting."),
      includeHidden: z.boolean().default(false).describe("Include hidden agents in the results"),
      format: z.enum(["summary", "detailed"]).default("summary").describe("Output format: summary (compact) or detailed (full info)")
    }),
    async execute(args: { mode?: "subagent" | "primary" | "all" | "worker" | "system"; includeHidden?: boolean; format?: "summary" | "detailed" }, ctx) {
      await ctx.ask({
        permission: "agent_list",
        patterns: [],
        always: ["*"],
        metadata: {}
      })

      const agents = host(ctx).agents
      if (!agents) throw new Error("Agent management is not available in this context")

      try {
        const all = (await agents.list()) as any[]

        let filteredAgents = all
        if (args.mode) {
          filteredAgents = filteredAgents.filter(agent => agent.mode === args.mode)
        }
        if (!args.includeHidden) {
          filteredAgents = filteredAgents.filter(agent => !agent.hidden)
        }

        if (filteredAgents.length === 0) {
          return {
            title: "No Agents Found",
            metadata: { count: 0 },
            output: args.mode
              ? `No agents found with mode "${args.mode}"${args.includeHidden ? '' : ' (excluding hidden agents)'}.`
              : `No agents found${args.includeHidden ? '' : ' (excluding hidden agents)'}.`
          }
        }

        if (args.format === "detailed") {
          const agentDetails = filteredAgents.map(agent => {
            const details = [
              `ID: ${agent.id}`,
              `Name: ${agent.name}`,
              `Mode: ${agent.mode}`,
              `Description: ${agent.description || 'No description'}`,
              `Temperature: ${agent.temperature ?? 'default'}`,
              `Steps: ${agent.steps ?? 'default'}`,
              `Model: ${agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : 'default'}`,
              `Tools: ${agent.tools ? agent.tools.join(', ') : 'all available'}`,
              `Hidden: ${agent.hidden ?? false}`,
              `Enable Injection: ${agent.enableInjection ?? false}`
            ]
            return details.join('\n  ')
          }).join('\n\n')

          return {
            title: "Agent List (Detailed)",
            metadata: { count: filteredAgents.length },
            output: `Found ${filteredAgents.length} agent${filteredAgents.length === 1 ? '' : 's'}:\n\n${agentDetails}`
          }
        } else {
          const agentSummaries = filteredAgents.map(agent => {
            const modelInfo = agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : 'default'
            const toolInfo = agent.tools ? `${agent.tools.length} tools` : 'all tools'
            return `- ${agent.name} (${agent.id}) - ${agent.mode} - ${modelInfo} - ${toolInfo}${agent.hidden ? ' [hidden]' : ''}`
          }).join('\n')

          return {
            title: "Agent List",
            metadata: { count: filteredAgents.length },
            output: `Found ${filteredAgents.length} agent${filteredAgents.length === 1 ? '' : 's'}:\n\n${agentSummaries}`
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Failed to list agents: ${error.message}`)
        }
        throw new Error(`Failed to list agents: ${String(error)}`)
      }
    }
  })
)
