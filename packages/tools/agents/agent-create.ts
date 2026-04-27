import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./agent-create.json"

export const AgentCreateTool = Tool.define(
  "agent_create",
  async (initCtx) => ({
    description: toolDef.description,
    parameters: z.object({
      id: z.string().describe("Unique identifier for the new agent (will be auto-formatted)"),
      name: z.string().describe("Human-readable name for the agent"),
      description: z.string().optional().describe("Description of what this agent does and when to use it"),
      mode: z.enum(["subagent", "primary", "all", "worker", "system"]).default("all").describe("Agent mode: primary, worker, system, or legacy compatibility modes subagent/all."),
      model: z.object({
        providerID: z.string(),
        modelID: z.string()
      }).optional().describe("Preferred model configuration for this agent"),
      fallbackModel: z.object({
        providerID: z.string(),
        modelID: z.string()
      }).optional().describe("Fallback model if preferred model is unavailable"),
      temperature: z.number().min(0).max(2).optional().describe("Temperature for model responses (0.0-2.0)"),
      steps: z.number().int().positive().optional().describe("Maximum number of steps the agent can take"),
      color: z.string().optional().describe("Hex color code for UI display"),
      hidden: z.boolean().optional().describe("Whether to hide this agent from UI listings"),
      tools: z.array(z.string()).optional().describe("Specific tools this agent can use (empty array = no tools, undefined = all available tools)"),
      skills: z.array(z.string()).optional().describe("Skills allocated to this agent (skill names)"),
      enableInjection: z.boolean().optional().describe("Enable dynamic prompt injection for this agent"),
      persona: z.string().optional().describe("The agent's persona and system prompt (PERSONA.md content)"),
      injection: z.string().optional().describe("Dynamic injection content (INJECTION.md content)")
    }),
    async execute(args: {
      id: string
      name: string
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
        permission: "agent_create",
        patterns: [],
        always: ["*"],
        metadata: { agentName: args.name }
      })

      const agents = host(ctx).agents
      if (!agents) throw new Error("Agent management is not available in this context")

      try {
        const config = {
          name: args.name,
          description: args.description,
          mode: args.mode || "all",
          model: args.model,
          fallback_model: args.fallbackModel,
          temperature: args.temperature,
          steps: args.steps,
          color: args.color,
          hidden: args.hidden,
          tools: args.tools,
          skills: args.skills,
          enableInjection: args.enableInjection
        }

        await agents.create(args.id, config, args.persona || "", args.injection || "")
        const result = await agents.get(args.id) as any

        return {
          title: "Agent Created Successfully",
          metadata: {
            agentId: args.id,
            agentName: args.name,
            mode: args.mode || "all"
          },
          output: `Successfully created agent "${args.name}" (ID: ${args.id}) with mode: ${args.mode || 'all'}

Configuration:
- Name: ${args.name}
- Description: ${args.description || 'None provided'}
- Mode: ${args.mode || 'all'}
- Temperature: ${args.temperature ?? 'default'}
- Steps: ${args.steps ?? 'default'}
- Model: ${args.model ? `${args.model.providerID}/${args.model.modelID}` : 'default'}
- Tools: ${args.tools ? args.tools.join(', ') : 'all available'}
- Hidden: ${args.hidden ?? false}
- Enable Injection: ${args.enableInjection ?? false}

The agent has been saved to the file system and is now available for use.`
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('already exists')) {
            throw new Error(`Agent with ID "${args.id}" already exists. Please use a different ID or update the existing agent.`)
          }
          throw new Error(`Failed to create agent: ${error.message}`)
        }
        throw new Error(`Failed to create agent: ${String(error)}`)
      }
    }
  })
)
