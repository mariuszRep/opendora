import path from "path"
import z from "zod"
import { Tool } from "./tool"
import { Skill } from "@opendora/skills/skill"
import { PermissionNext } from "../permission/next"
import { addSkillTools } from "@opendora/session/skill-tools"

// Tool to load and use a specific skill
export const SkillLoadTool = Tool.define("skill_load", async (ctx) => {
  const agent = ctx?.agent
  const agentSkills = agent?.skills as string[] | undefined
  const agentToolsList = agent?.config?.toolConfig?.delegate?.allowedAgents as string[] | undefined
  // Agents with skill_list tool bypass the assignment restriction and can discover any skill
  const hasUnrestrictedDiscovery = agentToolsList?.includes("skill_list") ?? false

  const allSkills = await Skill.all()

  const accessibleSkills = agent
    ? allSkills.filter((skill) => {
        if (hasUnrestrictedDiscovery) return true
        if (agentSkills?.length) return agentSkills.includes(skill.name)
        // No skills assigned — fall back to permission check
        const rule = PermissionNext.evaluate("skill", skill.name, (agent.permission as PermissionNext.LegacyRuleset) ?? [])
        return rule.action !== "deny"
      })
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
        const available = accessibleSkills.map(s => s.name).join(", ")
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      const isAssigned = agentSkills?.includes(params.name)

      if (!hasUnrestrictedDiscovery && agentSkills?.length && !isAssigned) {
        const available = accessibleSkills.map(s => s.name).join(", ")
        throw new Error(`Skill "${params.name}" is not assigned to this agent. Assigned skills: ${available || "none"}`)
      }

      // Assignment in agent config is the permission grant — only ask for unassigned discovery
      if (!isAssigned) {
        await ctx.ask({
          permission: "skill",
          patterns: [params.name],
          always: [params.name],
          metadata: {},
        })
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
