import { Tool } from "./tool"
import { Agent } from "../agent"
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
      // Ask for permission to get agent details
      await ctx.ask({
        permission: "agent_get",
        patterns: [],
        always: ["*"],
        metadata: { agentId: args.id }
      })

      try {
        const agent = await Agent.get(args.id)
        if (!agent) {
          throw new Error(`Agent "${args.id}" not found. Use agent_list to see available agents.`)
        }

        // Get additional content if requested
        let personaContent = ""
        let injectionContent = ""

        if (args.includePersona) {
          try {
            personaContent = await Agent.getPersona(args.id)
          } catch (error) {
            personaContent = "Error retrieving persona content"
          }
        }

        if (args.includeInjection) {
          try {
            injectionContent = await Agent.getInjection(args.id)
          } catch (error) {
            injectionContent = "Error retrieving injection content"
          }
        }

        // Build detailed agent information
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

        if (args.includePersona && personaContent) {
          output += `\n\nPersona:\n${personaContent}`
        }

        if (args.includeInjection && injectionContent) {
          output += `\n\nInjection:\n${injectionContent}`
        }

        return {
          title: `Agent: ${agent.name}`,
          metadata: {
            agentId: agent.id,
            agentName: agent.name,
            mode: agent.mode,
            hasPersona: !!personaContent,
            hasInjection: !!injectionContent
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
