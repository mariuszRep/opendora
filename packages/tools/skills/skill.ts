import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"

// Tool to discover/list available skills
export const SkillDiscoverTool = Tool.define("skill_discover", async (_initCtx) => {
  const description =
    "Discover and list available skills that provide domain-specific instructions and workflows. Use this tool to see what specialized skills are available. To actually load and use a skill, use the skill_load tool."

  const parameters = z.object({})

  return {
    description,
    parameters,
    async execute(_params: z.infer<typeof parameters>, ctx) {
      const skills = host(ctx).skills
      if (!skills) {
        throw new Error("Skill discovery is not available in this context")
      }

      const all = await skills.all()

      return {
        title: "Available Skills",
        metadata: {
          count: all.length,
          skills: all.map(s => s.name),
        },
        output: [
          "<available_skills>",
          ...all.flatMap((skill) => [
            `  <skill>`,
            `    <name>${skill.name}</name>`,
            `    <description>${skill.description}</description>`,
            `    <location>${pathToFileURL(skill.location).href}</location>`,
            `  </skill>`,
          ]),
          "</available_skills>",
          "",
          `Total: ${all.length} skill(s) available`,
          "",
          "To load a skill, use the skill_load tool with the skill name.",
        ].join("\n"),
      }
    },
  }
})

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

// Export both tools
export const SkillTool = SkillLoadTool // For backward compatibility
