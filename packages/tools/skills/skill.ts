import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./skill.json"

export const SkillLoadTool = Tool.define("skill_load", async (_initCtx) => {
  const parameters = z.object({
    name: z.string().describe("The name of the skill to load"),
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
        const available = all.map((s) => s.name).join(", ")
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      await ctx.ask({
        permission: "skill",
        patterns: [params.name],
        always: [params.name],
        metadata: {},
      })

      // Unlock any tools this skill declares (from skill.json) for the current session,
      // so the agent's effective allowlist expands beyond its static agent.json tools array.
      // Also store a name marker so the session endpoint can detect this skill was loaded
      // even when the skill has no tools.
      const skillTools = (skill as { tools?: string[] }).tools
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
