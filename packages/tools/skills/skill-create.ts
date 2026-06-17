import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./skill-create.json"

export const SkillCreateTool = Tool.define("skill_create", async (initCtx) => {
  const description = toolDef.description

  const parameters = z.object({
    name: z.string().describe("Skill name (used as directory name and registry key, e.g. 'my-skill')"),
    description: z.string().describe("One-line description of when to trigger this skill and what it does"),
    tools: z
      .array(z.string())
      .optional()
      .describe("Tool names this skill requires (e.g. ['skill_load', 'read', 'glob'])"),
    content: z.string().optional().describe("Markdown body of the SKILL.md (the instructions agents will follow)"),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skills = host(ctx).skills
      if (!skills?.create) {
        throw new Error("Skill creation is not available in this context")
      }

      const result = await skills.create({
        name: params.name,
        description: params.description,
        tools: params.tools,
        content: params.content,
      })

      // Auto-assign the new skill to the calling agent so it can be loaded immediately.
      const callingAgentID = initCtx?.agent?.id
      let assigned = false
      if (callingAgentID) {
        const agents = host(ctx).agents
        if (agents) {
          const agentInfo = await agents.get(callingAgentID).catch(() => undefined) as any
          const currentSkills: string[] = agentInfo?.config?.skills ?? agentInfo?.skills ?? []
          if (!currentSkills.includes(params.name)) {
            await agents.update(callingAgentID, { skills: [...currentSkills, params.name] }).catch(() => {})
          }
          assigned = true
        }
      }

      return {
        title: `Created skill: ${params.name}`,
        metadata: {
          name: params.name,
          dir: result.dir,
        },
        output: [
          `Skill "${params.name}" created and registered.`,
          `Directory: ${result.dir}`,
          "",
          assigned
            ? `Assigned to this agent — use skill_load({ name: "${params.name}" }) to load it now.`
            : `To load it, assign it first: agent_update({ id: '<agent-id>', skills: [...existing, '${params.name}'] })`,
          "To add scripts, agents, or reference files, write them into the skill directory using the write tool.",
        ].join("\n"),
      }
    },
  }
})
