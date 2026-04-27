import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import z from "zod"
import toolDef from "./agent-get.json"

export const AgentGetTool = Tool.define(
  "agent_get",
  async () => ({
    description: toolDef.description,

    parameters: z.object({
      id: z.string().describe("ID of the agent to retrieve"),
      view: z
        .enum(["config", "persona", "injection", "tools", "skills", "system_prompt"])
        .default("config")
        .describe(
          "What to return: config (default), persona, injection, tools, skills, or system_prompt (full assembled view)"
        ),
    }),

    async execute(args: { id: string; view?: "config" | "persona" | "injection" | "tools" | "skills" | "system_prompt" }, ctx) {
      await ctx.ask({
        permission: "agent_get",
        patterns: [],
        always: ["*"],
        metadata: { agentId: args.id },
      })

      const services = host(ctx)
      const agents = services.agents
      if (!agents) throw new Error("Agent management is not available in this context")

      const agent = (await agents.get(args.id)) as any
      if (!agent) {
        throw new Error(`Agent "${args.id}" not found. Use agent_list to see available agents.`)
      }

      const view = args.view ?? "config"

      // ── config ─────────────────────────────────────────────────────────────
      if (view === "config") {
        const lines = [
          `ID: ${agent.id}`,
          `Name: ${agent.name}`,
          `Mode: ${agent.mode}`,
          `Description: ${agent.description || "none"}`,
          `Temperature: ${agent.temperature ?? "default"}`,
          `Steps: ${agent.steps ?? "default"}`,
          `Color: ${agent.color ?? "none"}`,
          `Hidden: ${agent.hidden ?? false}`,
          `Model: ${agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : "default"}`,
          `Enable Injection: ${agent.enableInjection ?? false}`,
          `Tools: ${agent.tools ? agent.tools.join(", ") : "all available"}`,
          `Skills: ${agent.skills && agent.skills.length > 0 ? agent.skills.join(", ") : "none"}`,
        ]
        return {
          title: `Agent Config: ${agent.name}`,
          metadata: { agentId: agent.id, view },
          output: lines.join("\n"),
        }
      }

      // ── persona ─────────────────────────────────────────────────────────────
      if (view === "persona") {
        const persona = agent.prompt ?? ""
        return {
          title: `Agent Persona: ${agent.name}`,
          metadata: { agentId: agent.id, view },
          output: persona || "(no persona configured)",
        }
      }

      // ── injection ──────────────────────────────────────────────────────────
      if (view === "injection") {
        const injection = agents.getInjection ? await agents.getInjection(args.id) : ""
        return {
          title: `Agent Injection: ${agent.name}`,
          metadata: { agentId: agent.id, view },
          output: injection || "(no injection configured)",
        }
      }

      // ── tools ──────────────────────────────────────────────────────────────
      if (view === "tools") {
        const toolIds: string[] = agent.tools ?? []
        if (toolIds.length === 0) {
          return {
            title: `Agent Tools: ${agent.name}`,
            metadata: { agentId: agent.id, view },
            output: "All available tools (no restrictions configured)",
          }
        }
        const output = `Tools allocated to ${agent.name} (${toolIds.length}):\n\n${toolIds.map((id: string) => `- ${id}`).join("\n")}`
        return {
          title: `Agent Tools: ${agent.name}`,
          metadata: { agentId: agent.id, view },
          output,
        }
      }

      // ── skills ─────────────────────────────────────────────────────────────
      if (view === "skills") {
        const skillNames: string[] = agent.skills ?? []
        if (skillNames.length === 0) {
          return {
            title: `Agent Skills: ${agent.name}`,
            metadata: { agentId: agent.id, view },
            output: "(no skills allocated)",
          }
        }

        const skillsService = services.skills
        const sections: string[] = []

        for (const name of skillNames) {
          if (skillsService?.get) {
            const skill = await skillsService.get(name)
            if (skill) {
              sections.push(`## Skill: ${name}\n\n${skill.content}`)
            } else {
              sections.push(`## Skill: ${name}\n\n(not found)`)
            }
          } else {
            sections.push(`## Skill: ${name}`)
          }
        }

        return {
          title: `Agent Skills: ${agent.name}`,
          metadata: { agentId: agent.id, view },
          output: sections.join("\n\n---\n\n"),
        }
      }

      // ── system_prompt ──────────────────────────────────────────────────────
      if (view === "system_prompt") {
        const parts: string[] = []

        const persona = agent.prompt ?? ""
        if (persona) {
          parts.push(`# PERSONA\n\n${persona}`)
        }

        const injection = agents.getInjection ? await agents.getInjection(args.id) : ""
        if (injection) {
          parts.push(`# INJECTION\n\n${injection}`)
        }

        const toolIds: string[] = agent.tools ?? []
        if (toolIds.length > 0) {
          parts.push(`# TOOLS\n\n${toolIds.map((id: string) => `- ${id}`).join("\n")}`)
        } else {
          parts.push(`# TOOLS\n\nAll available tools (no restrictions)`)
        }

        const skillNames: string[] = agent.skills ?? []
        if (skillNames.length > 0) {
          const skillsService = services.skills
          const skillSections: string[] = []
          for (const name of skillNames) {
            if (skillsService?.get) {
              const skill = await skillsService.get(name)
              skillSections.push(skill ? `### ${name}\n\n${skill.content}` : `### ${name}\n\n(not found)`)
            } else {
              skillSections.push(`### ${name}`)
            }
          }
          parts.push(`# SKILLS\n\n${skillSections.join("\n\n---\n\n")}`)
        }

        return {
          title: `Agent System Prompt: ${agent.name}`,
          metadata: { agentId: agent.id, view },
          output: parts.join("\n\n---\n\n"),
        }
      }

      throw new Error(`Unknown view: ${view}`)
    },
  })
)
