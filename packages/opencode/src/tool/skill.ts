import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"
import { PermissionNext } from "../permission/next"
import { Ripgrep } from "../file/ripgrep"
import { iife } from "@/util/iife"

// Tool to discover/list available skills
export const SkillDiscoverTool = Tool.define("skill_discover", async (ctx) => {
  const agent = ctx?.agent
  const allSkills = await Skill.all()
  
  // Filter skills by agent permissions if agent provided
  const accessibleSkills = agent
    ? allSkills.filter((skill) => {
        const rule = PermissionNext.evaluate("skill", skill.name, agent.permission)
        return rule.action !== "deny"
      })
    : allSkills

  const description = [
    "Discover and list available skills that provide domain-specific instructions and workflows.",
    "",
    "Use this tool to see what specialized skills are available. To actually load and use a skill, use the skill_load tool.",
    "",
    "Available skills:",
    ...accessibleSkills.flatMap((skill) => [
      `  - ${skill.name}: ${skill.description}`,
    ]),
  ].join("\n")

  const parameters = z.object({})

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const allSkills = await Skill.all()
      
      const accessibleSkills = agent
        ? allSkills.filter((skill) => {
            const rule = PermissionNext.evaluate("skill", skill.name, agent.permission)
            return rule.action !== "deny"
          })
        : allSkills

      return {
        title: "Available Skills",
        metadata: {
          count: accessibleSkills.length,
          skills: accessibleSkills.map(s => s.name),
        },
        output: [
          "<available_skills>",
          ...accessibleSkills.flatMap((skill) => [
            `  <skill>`,
            `    <name>${skill.name}</name>`,
            `    <description>${skill.description}</description>`,
            `    <location>${pathToFileURL(skill.location).href}</location>`,
            `  </skill>`,
          ]),
          "</available_skills>",
          "",
          `Total: ${accessibleSkills.length} skill(s) available`,
          "",
          "To load a skill, use the skill_load tool with the skill name.",
        ].join("\n"),
      }
    },
  }
})

// Tool to load and use a specific skill
export const SkillLoadTool = Tool.define("skill_load", async (ctx) => {
  const agent = ctx?.agent
  const allSkills = await Skill.all()
  
  const accessibleSkills = agent
    ? allSkills.filter((skill) => {
        const rule = PermissionNext.evaluate("skill", skill.name, agent.permission)
        return rule.action !== "deny"
      })
    : allSkills

  const examples = accessibleSkills
    .map((skill) => `'${skill.name}'`)
    .slice(0, 3)
    .join(", ")
  const hint = examples.length > 0 ? ` (e.g., ${examples}, ...)` : ""

  const description = [
    "Load a specialized skill that provides domain-specific instructions and workflows.",
    "",
    "When you recognize that a task matches one of the available skills, use this tool to load the full skill instructions.",
    "",
    "The skill will inject detailed instructions, workflows, and access to bundled resources (scripts, references, templates) into the conversation context.",
    "",
    'Tool output includes a `<skill_content name="...">` block with the loaded content.',
    "",
    "Available skills:",
    ...accessibleSkills.map((skill) => `  - ${skill.name}: ${skill.description}`),
  ].join("\n")

  const parameters = z.object({
    name: z.string().describe(`The name of the skill to load${hint}`),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skill = await Skill.get(params.name)

      if (!skill) {
        const available = await Skill.all().then((x) => x.map(s => s.name).join(", "))
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

      const limit = 10
      const files = await iife(async () => {
        const arr = []
        for await (const file of Ripgrep.files({
          cwd: dir,
          follow: false,
          hidden: true,
          signal: ctx.abort,
        })) {
          if (file.includes("SKILL.md")) {
            continue
          }
          arr.push(path.resolve(dir, file))
          if (arr.length >= limit) {
            break
          }
        }
        return arr
      }).then((f) => f.map((file) => `<file>${file}</file>`).join("\n"))

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
