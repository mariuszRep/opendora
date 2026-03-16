import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"

export const AgentGetTool = Tool.define(
  "agent_get",
  async (initCtx) => ({
    description: "Get detailed information about a specific agent including configuration, persona, and injection content.",
    parameters: z.object({
      id: z.string().describe("ID of the agent to retrieve"),
      includePersona: z.boolean().default(true).describe("Include the agent's persona content"),
      includeInjection: z.boolean().default(false).describe("Include the agent's injection content")
    }),
    async execute(args: { id: string; includePersona?: boolean; includeInjection?: boolean }, ctx) {
      await ctx.ask({
        permission: "agent_get",
        patterns: [],
        always: ["*"],
        metadata: { agentId: args.id }
      })

      const agents = host(ctx).agents
      if (!agents) throw new Error("Agent management is not available in this context")

      try {
        const agent = await agents.get(args.id) as any
        if (!agent) {
          throw new Error(`Agent "${args.id}" not found. Use agent_list to see available agents.`)
        }

        const details = [
          `ID: ${agent.id}`,
          `Name: ${agent.name}`,
          `Mode: ${agent.mode}`,
          `Description: ${agent.description || 'No description provided'}`,
          `Temperature: ${agent.temperature ?? 'default'}`,
          `Steps: ${agent.steps ?? 'default'}`,
          `Color: ${agent.color ?? 'none'}`,
          `Hidden: ${agent.hidden ?? false}`,
          `Model: ${agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : 'default'}`,
          `Tools: ${agent.tools ? agent.tools.join(', ') : 'all available'}`,
          `Enable Injection: ${agent.enableInjection ?? false}`
        ]

        let output = `Agent Details:\n\n${details.join('\n')}`

        if (args.includePersona && agent.persona) {
          output += `\n\nPersona:\n${agent.persona}`
        }

        if (args.includeInjection && agent.injection) {
          output += `\n\nInjection:\n${agent.injection}`
        }

        return {
          title: `Agent: ${agent.name}`,
          metadata: {
            agentId: agent.id,
            agentName: agent.name,
            mode: agent.mode,
          },
          output
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            throw new Error(`Agent "${args.id}" not found. Use agent_list to see available agents.`)
          }
          throw new Error(`Failed to get agent: ${error.message}`)
        }
        throw new Error(`Failed to get agent: ${String(error)}`)
      }
    }
  })
)
