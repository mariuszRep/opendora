import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"

export const AgentUpdateTool = Tool.define(
  "agent_update",
  async (initCtx) => ({
    description: "Update an existing agent's configuration, persona, and/or injection. This allows agents to modify other agents' settings.",
    parameters: z.object({
      id: z.string().describe("ID of the agent to update"),
      name: z.string().optional().describe("New human-readable name for the agent"),
      description: z.string().optional().describe("New description of what this agent does"),
      mode: z.enum(["subagent", "primary", "all", "worker", "system"]).optional().describe("New agent mode"),
      model: z.object({
        providerID: z.string(),
        modelID: z.string()
      }).optional().describe("New preferred model configuration"),
      fallbackModel: z.object({
        providerID: z.string(),
        modelID: z.string()
      }).optional().describe("New fallback model configuration"),
      temperature: z.number().min(0).max(2).optional().describe("New temperature for model responses"),
      steps: z.number().int().positive().optional().describe("New maximum number of steps"),
      color: z.string().optional().describe("New hex color code for UI display"),
      hidden: z.boolean().optional().describe("Whether to hide this agent from UI listings"),
      tools: z.array(z.string()).optional().describe("New tool restrictions for this agent"),
      skills: z.array(z.string()).optional().describe("Skills allocated to this agent (skill names)"),
      enableInjection: z.boolean().optional().describe("Whether to enable dynamic prompt injection"),
      persona: z.string().optional().describe("New persona and system prompt content"),
      injection: z.string().optional().describe("New dynamic injection content")
    }),
    async execute(args: {
      id: string
      name?: string
      description?: string
      mode?: "subagent" | "primary" | "all" | "worker" | "system"
      model?: { providerID: string; modelID: string }
      fallbackModel?: { providerID: string; modelID: string }
      temperature?: number
      steps?: number
      color?: string
      hidden?: boolean
      tools?: string[]
      skills?: string[]
      enableInjection?: boolean
      persona?: string
      injection?: string
    }, ctx) {
      await ctx.ask({
        permission: "agent_update",
        patterns: [],
        always: ["*"],
        metadata: { agentId: args.id }
      })

      const agents = host(ctx).agents
      if (!agents) throw new Error("Agent management is not available in this context")

      try {
        const existingAgent = await agents.get(args.id) as any
        if (!existingAgent) {
          throw new Error(`Agent "${args.id}" not found. Use agent_list to see available agents.`)
        }

        const configPatch: Record<string, unknown> = {}
        if (args.name !== undefined) configPatch.name = args.name
        if (args.description !== undefined) configPatch.description = args.description
        if (args.mode !== undefined) configPatch.mode = args.mode
        if (args.model !== undefined) configPatch.model = args.model
        if (args.fallbackModel !== undefined) configPatch.fallback_model = args.fallbackModel
        if (args.temperature !== undefined) configPatch.temperature = args.temperature
        if (args.steps !== undefined) configPatch.steps = args.steps
        if (args.color !== undefined) configPatch.color = args.color
        if (args.hidden !== undefined) configPatch.hidden = args.hidden
        if (args.tools !== undefined) configPatch.tools = args.tools
        if (args.skills !== undefined) configPatch.skills = args.skills
        if (args.enableInjection !== undefined) configPatch.enableInjection = args.enableInjection

        await agents.update(args.id, configPatch, args.persona, args.injection)
        const result = await agents.get(args.id) as any

        const changes: string[] = []
        if (args.name !== undefined) changes.push(`Name: "${existingAgent.name}" → "${args.name}"`)
        if (args.description !== undefined) changes.push(`Description: ${existingAgent.description || 'none'} → "${args.description}"`)
        if (args.mode !== undefined) changes.push(`Mode: ${existingAgent.mode} → ${args.mode}`)
        if (args.model !== undefined) {
          const oldModel = existingAgent.model ? `${existingAgent.model.providerID}/${existingAgent.model.modelID}` : 'default'
          const newModel = `${args.model.providerID}/${args.model.modelID}`
          changes.push(`Model: ${oldModel} → ${newModel}`)
        }
        if (args.temperature !== undefined) changes.push(`Temperature: ${existingAgent.temperature ?? 'default'} → ${args.temperature}`)
        if (args.steps !== undefined) changes.push(`Steps: ${existingAgent.steps ?? 'default'} → ${args.steps}`)
        if (args.hidden !== undefined) changes.push(`Hidden: ${existingAgent.hidden ?? false} → ${args.hidden}`)
        if (args.enableInjection !== undefined) changes.push(`Injection enabled: ${existingAgent.enableInjection ?? false} → ${args.enableInjection}`)
        if (args.persona !== undefined) changes.push(`Persona: updated`)
        if (args.injection !== undefined) changes.push(`Injection: updated`)

        const name = result?.name ?? args.name ?? existingAgent.name
        const id = result?.id ?? args.id

        return {
          title: "Agent Updated Successfully",
          metadata: {
            agentId: id,
            agentName: name,
            changesCount: changes.length
          },
          output: `Successfully updated agent "${name}" (ID: ${id})

Changes made:
${changes.length > 0 ? changes.map(change => `- ${change}`).join('\n') : 'No configuration changes'}

The agent has been updated and changes are now active.`
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            throw new Error(`Agent "${args.id}" not found. Use agent_list to see available agents or agent_create to create a new one.`)
          }
          throw new Error(`Failed to update agent: ${error.message}`)
        }
        throw new Error(`Failed to update agent: ${String(error)}`)
      }
    }
  })
)
