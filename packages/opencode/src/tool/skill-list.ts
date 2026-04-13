import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"

export const SkillListTool = Tool.define("skill_list", async (_ctx) => {
  const description =
    "List all installed skills with their metadata (source, version, registry). Shows skills from the lock file."

  const parameters = z.object({})

  return {
    description,
    parameters,
    async execute(_params: z.infer<typeof parameters>, ctx) {
      const installed = await Skill.list()

      return {
        title: "Installed Skills",
        metadata: {
          count: installed.length,
        },
        output: [
          "<installed_skills>",
          ...installed.flatMap((skill) => [
            `  <skill>`,
            `    <name>${skill.name}</name>`,
            `    <version>${skill.version}</version>`,
            `    <source>${skill.source}</source>`,
            `    <sourceType>${skill.sourceType}</sourceType>`,
            `  </skill>`,
          ]),
          "</installed_skills>",
          "",
          `Total: ${installed.length} installed skill(s)`,
        ].join("\n"),
      }
    },
  }
})
