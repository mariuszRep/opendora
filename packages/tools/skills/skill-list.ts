import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./skill-list.json"

export const SkillListTool = Tool.define("skill_list", async (_initCtx) => {
  const description = toolDef.description

  const parameters = z.object({})

  return {
    description,
    parameters,
    async execute(_params: z.infer<typeof parameters>, ctx) {
      const skills = host(ctx).skills
      if (!skills) {
        throw new Error("Skill service is not available in this context")
      }

      const all = await skills.all()

      return {
        title: "Available Skills",
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
          "To load a skill, use the skill_load tool with the skill name.",
          "To install a skill from an external registry, use skill_install.",
          "To create a new local skill, use skill_create.",
        ].join("\n"),
      }
    },
  }
})
