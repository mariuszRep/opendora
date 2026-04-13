import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"

export const SkillRemoveTool = Tool.define("skill_remove", async (_initCtx) => {
  const description =
    "Remove an installed or locally created skill by name. Deletes the skill directory and reloads the skill registry. This is irreversible — the skill files will be deleted."

  const parameters = z.object({
    name: z.string().describe("Name of the skill to remove"),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skills = host(ctx).skills
      if (!skills?.remove) {
        throw new Error("Skill removal is not available in this context")
      }

      await ctx.ask({
        permission: "skill_remove",
        patterns: [params.name],
        always: [],
        metadata: { name: params.name },
      })

      await skills.remove(params.name)

      return {
        title: `Removed skill: ${params.name}`,
        metadata: { name: params.name },
        output: `Skill "${params.name}" removed successfully.`,
      }
    },
  }
})
