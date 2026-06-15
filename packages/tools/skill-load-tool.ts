import path from "path"
import z from "zod"
import { Tool } from "@opendora/tools/tool"
// @ts-ignore — skills depends on tools creating a circular workspace ref; resolved at runtime
import { Skill } from "@opendora/skills/skill"
import { addSkillTools } from "@opendora/session/skill-tools"

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
    "When a task matches one of those skills, use this tool to load the full instructions.",
    "",
    "The skill will inject detailed instructions, workflows, and access to bundled resources (scripts, references, templates) into the conversation context.",
    "",
    'Tool output includes a `<skill_content name="...">` block with the loaded content.',
  ].join("\n")

  const parameters = z.object({
    name: z.string().describe("The name of the skill to load (see Available Skills in system prompt)"),
  })

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

      return {
        title: `Loaded skill: ${skill.name}`,
        output: `Skill "${skill.name}" loaded from ${dir}/SKILL.md`,
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
