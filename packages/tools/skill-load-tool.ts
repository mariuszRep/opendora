import path from "path"
import fs from "fs/promises"
import z from "zod"
import { Tool } from "@projectflows/tools/tool"
// @ts-ignore — skills depends on tools creating a circular workspace ref; resolved at runtime
import { Skill } from "@projectflows/skills/skill"
import { addSkillTools } from "@projectflows/session/skill-tools"

// Tool to load and use a specific skill
export const SkillLoadTool = Tool.define("skill_load", async (ctx) => {
  const agent = ctx?.agent
  // agent.skills is derived from agent-scoped `skill` permission rules
  // (see runtime/agent.ts deriveEnabledSkills): enabled === visible === loadable.
  const agentSkills = agent?.skills as string[] | undefined

  const allSkills = await Skill.all()

  // An agent can only see (and therefore load) the skills it has enabled.
  // When there is no agent context (e.g. system tooling), all skills are visible.
  const accessibleSkills = agent
    ? allSkills.filter((skill: any) => agentSkills?.includes(skill.name) ?? false)
    : allSkills

  const description = [
    "Load a specialized skill that provides domain-specific instructions and workflows.",
    "",
    "Your available skills are listed in the system prompt under 'Available Skills'.",
    "When a task matches one of those skills, use this tool to activate it.",
    "",
    "The tool output includes a `<skill_content name=\"...\">` block with the skill location and a `<skill_resources>` listing of bundled files. Use your file-read tool to load the SKILL.md at the listed location before following the instructions.",
  ].join("\n")

  const parameters = z.object({
    name: z.string().describe("The name of the skill to load (see Available Skills in system prompt)"),
  })

  async function listFiles(dir: string): Promise<string[]> {
    const files: string[] = []
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          const nested = await listFiles(fullPath)
          files.push(...nested)
        } else {
          files.push(fullPath)
        }
      }
    } catch {
      // ignore directory read errors
    }
    return files
  }

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skill = await Skill.get(params.name)

      if (!skill) {
        const available = accessibleSkills.map((s: any) => s.name).join(", ")
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      // Enabled === visible === loadable. An agent may only load a skill that
      // is enabled for it (an agent-scoped `skill` allow rule, surfaced via
      // agent.skills). No permission prompt: if it's visible, it loads.
      const isEnabled = agentSkills?.includes(params.name) ?? false
      if (agent && !isEnabled) {
        const available = accessibleSkills.map((s: any) => s.name).join(", ")
        throw new Error(`Skill "${params.name}" is not enabled for this agent. Enabled skills: ${available || "none"}`)
      }

      if (skill.tools?.length) {
        addSkillTools(ctx.sessionID, skill.tools)
      }

      const dir = path.dirname(skill.location)
      const allFiles = await listFiles(dir)
      const files = allFiles
        .filter((f) => !f.endsWith("SKILL.md"))
        .slice(0, 10)
        .map((f) => `<file>${f}</file>`)
        .join("\n")
      const xmlName = skill.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

      return {
        title: `Loaded skill: ${skill.name}`,
        output: [
          `<skill_content name="${xmlName}">`,
          `Skill "${skill.name}" is now active. Before following skill instructions, load the SKILL.md file at the location below.`,
          ``,
          `SKILL.md location: ${skill.location}`,
          `Skill directory (absolute path): ${dir}`,
          `Relative paths in this skill (e.g., scripts/, references/, assets/) are relative to this base directory.`,
          ``,
          "<skill_resources>",
          files,
          "</skill_resources>",
          "</skill_content>",
        ].join("\n"),
        metadata: {
          name: skill.name,
          dir,
          location: skill.location,
        },
      }
    },
  }
})

// Export both tools
export const SkillTool = SkillLoadTool // For backward compatibility
