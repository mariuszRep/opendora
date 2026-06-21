import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./skill-load.json"

export const SkillLoadTool = Tool.define("skill_load", async (initCtx) => {
  const agent = initCtx?.agent
  // agent.skills is derived from agent-scoped `skill` permission rules
  // (see runtime/agent.ts deriveEnabledSkills): enabled === visible === loadable.
  const agentSkills = agent?.skills as string[] | undefined

  const parameters = z.object({
    name: z.string().describe("The name of the skill to load (see Available Skills in system prompt)"),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skills = host(ctx).skills
      if (!skills) {
        throw new Error("Skill tool is not available in this context")
      }

      const skill = await skills.get(params.name)

      if (!skill) {
        const all = await skills.all()
        const available = agentSkills
          ? all.filter((s) => agentSkills.includes(s.name)).map((s) => s.name).join(", ")
          : all.map((s) => s.name).join(", ")
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      // Enabled === visible === loadable. An agent may only load a skill that
      // is enabled for it (an agent-scoped `skill` allow rule, surfaced via
      // agent.skills). No permission prompt: if it's visible, it loads.
      const isEnabled = agentSkills?.includes(params.name) ?? false
      if (agent && !isEnabled) {
        const all = await skills.all()
        const available = all.filter((s) => agentSkills?.includes(s.name) ?? false).map((s) => s.name).join(", ")
        throw new Error(`Skill "${params.name}" is not enabled for this agent. Enabled skills: ${available || "none"}`)
      }

      // Unlock any tools this skill declares for the current session,
      // so the agent's effective allowlist expands beyond its static agent.json tools array.
      // Also store a name marker so the session endpoint can detect this skill was loaded
      // even when the skill has no tools.
      const skillTools = skill.tools
      const toRegister = [`__skill__:${params.name}`, ...(skillTools ?? [])]
      host(ctx).skillTools?.add(ctx.sessionID, toRegister)

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

      const toolsNotice = skillTools && skillTools.length > 0
        ? [
            "",
            "<skill_tools_registered>",
            `Tools now registered for this session: ${skillTools.join(", ")}`,
            "IMPORTANT: These tools are active starting from your NEXT tool call.",
            "Do NOT attempt to call them in this response — they will appear as invalid.",
            "In your immediate next action you may use any of the tools listed above.",
            "</skill_tools_registered>",
          ].join("\n")
        : ""

      return {
        title: `Loaded skill: ${skill.name}`,
        output: [
          `<skill_content name="${skill.name}">`,
          `# Skill: ${skill.name}`,
          "",
          skill.content.trim(),
          "",
          `Base directory for this skill: ${base}`,
          `Skill directory (absolute path): ${dir}`,
          "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
          "Note: file list is sampled.",
          "",
          "<skill_files>",
          files,
          "</skill_files>",
          "</skill_content>",
          toolsNotice,
        ].join("\n"),
        metadata: {
          name: skill.name,
          dir,
          parameter: params.name,
        },
      }
    },
  }
})

export const SkillTool = SkillLoadTool
