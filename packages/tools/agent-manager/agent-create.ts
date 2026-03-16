import { Tool } from "./tool"
import { Agent } from "../agent/agent"
import { Instance } from "../project/instance"
import z from "zod"

export const AgentCreateTool = Tool.define(
  "agent_create",
  async (initCtx) => ({
    description: "Create a new agent with specified configuration, persona, and optional injection. This allows agents to create and manage other agents.",
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
      enableInjection?: boolean
      persona?: string
      injection?: string
    }, ctx) {
      // Ask for permission to create agents
      await ctx.ask({
        permission: "agent_create",
        patterns: [],
        always: ["*"],
        metadata: { agentName: args.name }
      })

      try {
        // Build agent config from arguments
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
          enableInjection: args.enableInjection
        }

        // Create the agent using the core agent functionality
        const result = await Agent.create(
          args.id,
          config,
          args.persona || "",
          args.injection || ""
        )

        return {
          title: "Agent Created Successfully",
          metadata: {
            agentId: result.id,
            agentName: result.config.name,
            mode: result.config.mode
          },
          output: `Successfully created agent "${result.config.name}" (ID: ${result.id}) with mode: ${result.config.mode || 'all'}

Configuration:
- Name: ${result.config.name}
- Description: ${result.config.description || 'None provided'}
- Mode: ${result.config.mode || 'all'}
- Temperature: ${result.config.temperature ?? 'default'}
- Steps: ${result.config.steps ?? 'default'}
- Model: ${result.config.model ? `${result.config.model.providerID}/${result.config.model.modelID}` : 'default'}
- Tools: ${result.config.tools ? result.config.tools.join(', ') : 'all available'}
- Hidden: ${result.config.hidden ?? false}
- Enable Injection: ${result.config.enableInjection ?? false}

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
