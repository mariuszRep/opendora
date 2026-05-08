import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"
import { PermissionNext } from "../permission/next"
import { Ripgrep } from "../file/ripgrep"
import { iife } from "@/util/iife"
import { addSkillTools } from "../session-skill-tools"

// Tool to load and use a specific skill
export const SkillLoadTool = Tool.define("skill_load", async (ctx) => {
  const agent = ctx?.agent
  const agentSkills = agent?.config?.skills as string[] | undefined
  const agentToolsList = agent?.tools as string[] | undefined
  // Agents with skill_list tool bypass the assignment restriction and can discover any skill
  const hasUnrestrictedDiscovery = agentToolsList?.includes("skill_list") ?? false

  const allSkills = await Skill.all()

  const accessibleSkills = agent
    ? allSkills.filter((skill) => {
        if (hasUnrestrictedDiscovery) return true
        if (agentSkills?.length) return agentSkills.includes(skill.name)
        // No skills assigned — fall back to permission check
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
        const available = accessibleSkills.map(s => s.name).join(", ")
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      if (!hasUnrestrictedDiscovery && agentSkills?.length && !agentSkills.includes(params.name)) {
        const available = accessibleSkills.map(s => s.name).join(", ")
        throw new Error(`Skill "${params.name}" is not assigned to this agent. Assigned skills: ${available || "none"}`)
      }

      await ctx.ask({
        permission: "skill",
        patterns: [params.name],
        always: [params.name],
        metadata: {},
      })

      if (skill.tools?.length) {
        addSkillTools(ctx.sessionID, skill.tools)
      }

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
