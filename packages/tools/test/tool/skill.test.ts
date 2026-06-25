import { describe, expect, test } from "bun:test"
import path from "path"
import { pathToFileURL } from "url"
import type { Tool } from "@opendora/tools/tool"
import { Instance } from "@opendora/runtime/instance"
import { SkillTool } from "@opendora/tools/skill-load-tool"
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
  test("description explains lazy pointer behavior", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skill", "tool-skill")
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
          const tool = await SkillTool.init()
          expect(tool.description).toContain("<skill_content")
          expect(tool.description).toContain("<skill_resources>")
          expect(tool.description).toContain("file-read tool")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("execute returns lazy pointer <skill_content> block with <skill_resources>", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skill", "tool-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: tool-skill
description: Skill for tool tests.
---

# Tool Skill

Use this skill.
`,
        )
        await Bun.write(path.join(skillDir, "scripts", "demo.txt"), "demo")
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const tool = await SkillTool.init()
          const ctx: Tool.Context = {
            ...baseCtx,
            ask: async () => {},
          }

          const result = await tool.execute({ name: "tool-skill" }, ctx)
          const dir = path.join(tmp.path, ".opencode", "skill", "tool-skill")
          const skillPath = path.join(dir, "SKILL.md")
          const file = path.resolve(dir, "scripts", "demo.txt")

          expect(result.metadata.dir).toBe(dir)
          expect(result.metadata.location).toBe(skillPath)
          expect(result.output).toContain(`<skill_content name="tool-skill">`)
          expect(result.output).toContain(`SKILL.md location: ${skillPath}`)
          expect(result.output).toContain(`Skill directory (absolute path): ${dir}`)
          expect(result.output).toContain("<skill_resources>")
          expect(result.output).toContain(`<file>${file}</file>`)
          expect(result.output).toContain("</skill_resources>")
          expect(result.output).not.toContain("Use this skill.")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })
})
