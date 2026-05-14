import z from "zod"

const ModelRef = z.object({ modelID: z.string(), providerID: z.string() })

export const AgentConfig = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all", "worker", "system"]).default("all"),
  model: ModelRef.optional(),
  fallback_model: ModelRef.optional(),
  models: z.array(ModelRef).optional(),
  temperature: z.number().optional(),
  steps: z.number().int().positive().optional(),
  color: z.string().optional(),
  hidden: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  toolConfig: z.object({
    delegate: z.object({
      allowedAgents: z.array(z.string()).optional(),
    }).optional(),
    reply: z.object({
      stopAfterReply: z.boolean().optional(),
    }).optional(),
  }).optional(),
  enableInjection: z.boolean().optional(),
  injectInstructions: z.boolean().optional(),
  defaultPaths: z.array(z.string()).optional(),
  sandbox: z.boolean().optional(),
})

export type AgentConfig = z.infer<typeof AgentConfig>

export type AgentTemplate = {
  id: string
  config: AgentConfig
  persona: string
  injection?: string
}
