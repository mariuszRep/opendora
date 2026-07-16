import { describe, expect, test } from "bun:test"
import path from "path"
import { pathToFileURL } from "url"
import type { Tool } from "@projectflows/tools/tool"
import { Instance } from "@projectflows/runtime/instance"
import { Skill } from "@projectflows/skills/skill"
import { SkillTool } from "@projectflows/tools/skill-load-tool"
import { tmpdir } from "../fixture/fixture"

const baseCtx: Omit<Tool.Context, "ask"> = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
}

describe("tool.skill", () => {
  test("description explains that skill content is injected", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skills", "tool-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: tool-skill
description: Skill for tool tests.
---

# Tool Skill
`,
        )
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Skill.reload()
          const tool = await SkillTool.init()
          expect(tool.description).toContain("complete SKILL.md")
          expect(tool.description).toContain("<skill_content")
          expect(tool.description).toContain("<skill_resources>")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("execute injects the complete SKILL.md with its resource listing", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skills", "tool-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: tool-skill
description: Skill for tool tests.
---

# Tool Skill

Use this skill.

Read [the extended guide](references/guide.md) only when you need the extra details.
`,
        )
        await Bun.write(path.join(skillDir, "scripts", "demo.txt"), "demo")
        await Bun.write(path.join(skillDir, "references", "guide.md"), "Supplemental guidance")
        await Bun.write(path.join(skillDir, "assets", "template.txt"), "Template asset")
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Skill.reload()
          const tool = await SkillTool.init()
          const ctx: Tool.Context = {
            ...baseCtx,
            ask: async () => {},
          }

          const result = await tool.execute({ name: "tool-skill" }, ctx)
          const dir = path.join(tmp.path, ".opencode", "skills", "tool-skill")
          const skillPath = path.join(dir, "SKILL.md")
          const file = path.resolve(dir, "scripts", "demo.txt")
          const reference = path.resolve(dir, "references", "guide.md")
          const asset = path.resolve(dir, "assets", "template.txt")

          expect(result.metadata.dir).toBe(dir)
          expect(result.metadata.location).toBe(skillPath)
          expect(result.output).toContain(`<skill_content name="tool-skill">`)
          expect(result.output).toContain("<skill_instructions>")
          expect(result.output).toContain("name: tool-skill")
          expect(result.output).toContain("Use this skill.")
          expect(result.output).toContain("references/guide.md")
          expect(result.output).toContain("</skill_instructions>")
          expect(result.output).toContain(`SKILL.md location: ${skillPath}`)
          expect(result.output).toContain(`Skill directory (absolute path): ${dir}`)
          expect(result.output).toContain("<skill_resources>")
          expect(result.output).toContain(`<file>${file}</file>`)
          expect(result.output).toContain(`<file>${reference}</file>`)
          expect(result.output).toContain(`<file>${asset}</file>`)
          expect(result.output).toContain("</skill_resources>")
          expect(result.output).not.toContain("Supplemental guidance")
          expect(result.output).not.toContain("Template asset")
          expect(result.output).not.toContain("load the SKILL.md file")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })
})
