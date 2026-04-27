import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./agent-delete.json"

export const AgentDeleteTool = Tool.define(
  "agent_delete",
  async (initCtx) => ({
    description: toolDef.description,
    parameters: z.object({
      id: z.string().describe("ID of the agent to delete"),
      confirm: z.boolean().describe("Confirmation flag - must be set to true to proceed with deletion")
    }),
    async execute(args: { id: string; confirm: boolean }, ctx) {
      await ctx.ask({
        permission: "agent_delete",
        patterns: [],
        always: ["*"],
        metadata: { agentId: args.id }
      })

      const agents = host(ctx).agents
      if (!agents) throw new Error("Agent management is not available in this context")

      try {
        if (!args.confirm) {
          throw new Error("Deletion requires explicit confirmation. Set confirm=true to proceed.")
        }

        const existingAgent = await agents.get(args.id) as any
        if (!existingAgent) {
          throw new Error(`Agent "${args.id}" not found. Use agent_list to see available agents.`)
        }

        const agentInfo = {
          id: existingAgent.id ?? args.id,
          name: existingAgent.name ?? args.id,
          description: existingAgent.description,
          mode: existingAgent.mode
        }

        await agents.remove(args.id)

        return {
          title: "Agent Deleted Successfully",
          metadata: {
            deletedAgentId: agentInfo.id,
            deletedAgentName: agentInfo.name
          },
          output: `Successfully deleted agent "${agentInfo.name}" (ID: ${agentInfo.id})

Deleted agent details:
- Name: ${agentInfo.name}
- Description: ${agentInfo.description || 'None provided'}
- Mode: ${agentInfo.mode}

This action cannot be undone. All agent data has been permanently removed from the file system.`
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            throw new Error(`Agent "${args.id}" not found. Use agent_list to see available agents.`)
          }
          throw new Error(`Failed to delete agent: ${error.message}`)
        }
        throw new Error(`Failed to delete agent: ${String(error)}`)
      }
    }
  })
)
