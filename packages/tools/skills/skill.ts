import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"

// Tool to load and use a specific skill
export const SkillLoadTool = Tool.define("skill_load", async (initCtx) => {
  const allowedSkills = initCtx?.agent?.skills ?? []

  const description = allowedSkills.length > 0
    ? `Load a specialized skill. This agent can load the following skills: ${allowedSkills.join(", ")}.`
    : "Load a specialized skill that provides domain-specific instructions and workflows. When you recognize that a task matches one of the available skills, use this tool to load the full skill instructions."

  const parameters = z.object({
    name: z.string().describe("The name of the skill to load"),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skills = host(ctx).skills
      if (!skills) {
        throw new Error("Skill tool is not available in this context")
      }

      if (allowedSkills.length > 0 && !allowedSkills.includes(params.name)) {
        throw new Error(
          `Skill "${params.name}" is not allocated to this agent. Allowed skills: ${allowedSkills.join(", ")}`
        )
      }

      const skill = await skills.get(params.name)

      if (!skill) {
        const all = await skills.all()
        const available = all.map((s) => s.name).join(", ")
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      await ctx.ask({
        permission: "skill",
        patterns: [params.name],
        always: [params.name],
        metadata: {},
      })

      const dir = path.dirname(skill.location)
      const base = pathToFileURL(dir).href

      // Get file listing via ripgrep if available
      const ripgrep = host(ctx).ripgrep
      let files = ""
      if (ripgrep) {
        const limit = 10
        const arr: string[] = []
        for await (const file of ripgrep.files({ cwd: dir, follow: false, hidden: true, signal: ctx.abort })) {
          if (file.includes("SKILL.md")) continue
          arr.push(path.resolve(dir, file))
          if (arr.length >= limit) break
        }
        files = arr.map((file) => `<file>${file}</file>`).join("\n")
      }

      return {
        title: `Loaded skill: ${skill.name}`,
        output: [
          `<skill_content name="${skill.name}">`,
          `# Skill: ${skill.name}`,
          "",
          skill.content.trim(),
          "",
          `Base directory for this skill: ${base}`,
          "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
          "Note: file list is sampled.",
          "",
          "<skill_files>",
          files,
          "</skill_files>",
          "</skill_content>",
        ].join("\n"),
        metadata: {
          name: skill.name,
          dir,
        },
      }
    },
  }
})

export const SkillTool = SkillLoadTool
