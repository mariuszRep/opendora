import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"

export const SkillListTool = Tool.define("skill_list", async () => {
  const description = [
    "List available skills.",
    "",
    "Without arguments: lists ALL skills on the system regardless of what is assigned to you.",
    "Use this to discover skills you can assign to other agents.",
    "",
    "With agent='<agent-name-or-id>': lists only the skills assigned to that specific agent.",
    "Use this before delegating to understand what skills the target agent has, so you can",
    "instruct them to preload the right ones for the task.",
    "",
    "Examples:",
    "  skill_list()                          → all system skills",
    "  skill_list({ agent: 'engineer' })     → skills assigned to the engineer agent",
  ].join("\n")

  const parameters = z.object({
    agent: z
      .string()
      .optional()
      .describe(
        "Agent name or ID to filter by. When provided, returns only the skills assigned to that agent.",
      ),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx): Promise<{ title: string; metadata: Record<string, any>; output: string }> {
      const skills = host(ctx).skills
      if (!skills) {
        throw new Error("Skill service is not available in this context")
      }

      const all = await skills.all()

      // Filter by agent assignment when agent param is provided
      if (params.agent) {
        const agentSvc = host(ctx).agents
        if (!agentSvc) {
          throw new Error("Agent service is not available in this context")
        }

        const agents = (await agentSvc.list()) as Array<{
          id: string
          config: { name?: string; skills?: string[] }
        }>

        const needle = params.agent.toLowerCase()
        const match = agents.find(
          (a) =>
            a.id.toLowerCase() === needle ||
            (a.config.name ?? "").toLowerCase() === needle,
        )

        if (!match) {
          const names = agents
            .map((a) => a.config.name ?? a.id)
            .join(", ")
          throw new Error(
            `Agent "${params.agent}" not found. Available agents: ${names || "none"}`,
          )
        }

        const assignedNames = match.config.skills ?? []
        const agentSkills = all.filter((s) => assignedNames.includes(s.name))

        return {
          title: `Skills assigned to ${match.config.name ?? match.id}`,
          metadata: {
            agent: match.config.name ?? match.id,
            count: agentSkills.length,
            skills: agentSkills.map((s) => s.name),
          },
          output: [
            `<agent_skills agent="${match.config.name ?? match.id}">`,
            ...(agentSkills.length === 0
              ? ["  (no skills assigned)"]
              : agentSkills.flatMap((skill) => [
                  `  <skill>`,
                  `    <name>${skill.name}</name>`,
                  `    <description>${skill.description}</description>`,
                  `  </skill>`,
                ])),
            "</agent_skills>",
            "",
            `Total: ${agentSkills.length} assigned skill(s)`,
            "",
            "When delegating, you can instruct this agent to preload relevant skills",
            "by including e.g. \"Start by loading the 'delivery-intake' skill\" in your delegation message.",
          ].join("\n"),
        }
      }

      // No agent param — list all skills on the system
      return {
        title: "All Available Skills",
        metadata: {
          count: all.length,
          skills: all.map((s) => s.name),
        },
        output: [
          "<skills>",
          ...all.flatMap((skill) => [
            `  <skill>`,
            `    <name>${skill.name}</name>`,
            `    <description>${skill.description}</description>`,
            `    <origin>${skill.origin ?? "unknown"}</origin>`,
            `    <location>${pathToFileURL(skill.location).href}</location>`,
            `  </skill>`,
          ]),
          "</skills>",
          "",
          `Total: ${all.length} skill(s)`,
          "",
          "To see skills assigned to a specific agent: skill_list({ agent: '<name>' })",
          "To load a skill into your own session: skill_load({ name: '<skill-name>' })",
          "To install a skill from an external registry: skill_install",
          "To create a new local skill: skill_create",
        ].join("\n"),
      }
    },
  }
})
