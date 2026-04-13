import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"

export const SkillCreateTool = Tool.define("skill_create", async (_initCtx) => {
  const description =
    "Create a new local skill under .opendora/skill/. Writes a SKILL.md with the provided frontmatter and body, registers it immediately (no session restart needed), and returns the skill directory path. Use the write/edit tools afterward to add optional scripts, agents, or reference files to the same directory."

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

      await ctx.ask({
        permission: "skill_create",
        patterns: [params.name],
        always: [],
        metadata: { name: params.name },
      })

      const result = await skills.create({
        name: params.name,
        description: params.description,
        tools: params.tools,
        content: params.content,
      })

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
          "The skill is immediately available — use skill_load to verify.",
          "To add scripts, agents, or reference files, write them into the skill directory using the write tool.",
        ].join("\n"),
      }
    },
  }
})
