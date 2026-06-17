import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./skill-edit.json"

export const SkillEditTool = Tool.define("skill_edit", async (_initCtx) => {
  const description = toolDef.description

  const parameters = z.object({
    name: z.string().describe("Name of the skill to edit"),
    content: z.string().optional().describe("New markdown body for the SKILL.md file (replaces existing content)"),
    tools: z.array(z.string()).optional().describe("Replacement tool list for skill.json (replaces existing tools array)"),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skills = host(ctx).skills
      if (!skills) {
        throw new Error("Skill tool is not available in this context")
      }

      if (params.content === undefined && params.tools === undefined) {
        throw new Error("At least one of 'content' or 'tools' must be provided")
      }

      const skill = await skills.get(params.name)
      if (!skill) {
        const all = await skills.all()
        const available = all.map((s) => s.name).join(", ")
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      const updated: string[] = []

      if (params.content !== undefined) {
        if (!skills.save) {
          throw new Error("Skill content editing is not available in this context")
        }
        await skills.save(skill.location, params.content)
        updated.push("SKILL.md content")
      }

      if (params.tools !== undefined) {
        if (!skills.saveConfig) {
          throw new Error("Skill config editing is not available in this context")
        }
        await skills.saveConfig(params.name, { tools: params.tools })
        updated.push("tool list")
      }

      return {
        title: `Edited skill: ${params.name}`,
        metadata: { name: params.name },
        output: `Skill "${params.name}" updated: ${updated.join(" and ")}.`,
      }
    },
  }
})
