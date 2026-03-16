import { Tool } from "./tool"
import { Agent } from "../agent"
import { Instance } from "../project/instance"
import z from "zod"

export const AgentDeleteTool = Tool.define(
  "agent_delete",
  async (initCtx) => ({
    description: "Delete an existing agent permanently. This action cannot be undone. Use with caution as it will remove all agent data including configuration, persona, and injection files.",
    parameters: z.object({
      id: z.string().describe("ID of the agent to delete"),
      confirm: z.boolean().describe("Confirmation flag - must be set to true to proceed with deletion")
    }),
    async execute(args: { id: string; confirm: boolean }, ctx) {
      // Ask for permission to delete agents
      await ctx.ask({
        permission: "agent_delete",
        patterns: [],
        always: ["*"],
        metadata: { agentId: args.id }
      })

      try {
        if (!args.confirm) {
          throw new Error("Deletion requires explicit confirmation. Set confirm=true to proceed.")
        }

        // Check if agent exists first
        const existingAgent = await Agent.get(args.id)
        if (!existingAgent) {
          throw new Error(`Agent "${args.id}" not found. Use agent_list to see available agents.`)
        }

        // Store info for confirmation message
        const agentInfo = {
          id: existingAgent.id,
          name: existingAgent.name,
          description: existingAgent.description,
          mode: existingAgent.mode
        }

        // Delete the agent
        await Agent.remove(args.id)

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

⚠️  This action cannot be undone. All agent data including:
- Configuration file (agent.json)
- Persona file (PERSONA.md)  
- Injection file (INJECTION.md)
- Directory structure

has been permanently removed from the file system.`
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
