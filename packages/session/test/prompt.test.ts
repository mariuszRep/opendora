import path from "path"
import { describe, expect, test } from "bun:test"
import { fileURLToPath } from "url"
import { Instance } from "@projectflows/runtime/instance"
import { Session } from "../src/session"
import { configureSessionCore } from "@projectflows/server/configure-session-core"
import { MessageV2 } from "../src/message-v2"
import { SessionPrompt } from "../src/prompt"
import { SystemPrompt } from "../src/system"
import { Log } from "@projectflows/util/log"
import { tmpdir } from "./fixture/fixture"

Log.init({ print: false })
configureSessionCore()

describe("session.prompt missing file", () => {
  test("does not fail the prompt when a file part is missing", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        agent: {
          build: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})

        const missing = path.join(tmp.path, "does-not-exist.ts")
        const msg = await SessionPrompt.prompt({
          sessionID: session.id,
          agent: "build",
          noReply: true,
          parts: [
            { type: "text", text: "please review @does-not-exist.ts" },
            {
              type: "file",
              mime: "text/plain",
              url: `file://${missing}`,
              filename: "does-not-exist.ts",
            },
          ],
        })

        if (msg.info.role !== "user") throw new Error("expected user message")

        const hasFailure = msg.parts.some(
          (part) => part.type === "text" && part.synthetic && part.text.includes("Read tool failed to read"),
        )
        expect(hasFailure).toBe(true)

        await Session.remove(session.id)
      },
    })
  })

  test("keeps stored part order stable when file resolution is async", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        agent: {
          build: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})

        const missing = path.join(tmp.path, "still-missing.ts")
        const msg = await SessionPrompt.prompt({
          sessionID: session.id,
          agent: "build",
          noReply: true,
          parts: [
            {
              type: "file",
              mime: "text/plain",
              url: `file://${missing}`,
              filename: "still-missing.ts",
            },
            { type: "text", text: "after-file" },
          ],
        })

        if (msg.info.role !== "user") throw new Error("expected user message")

        const stored = await MessageV2.get({
          sessionID: session.id,
          messageID: msg.info.id,
        })
        const text = stored.parts.filter((part) => part.type === "text").map((part) => part.text)

        expect(text[0]?.startsWith("Called the Read tool with the following input:")).toBe(true)
        expect(text[1]?.includes("Read tool failed to read")).toBe(true)
        expect(text[2]).toBe("after-file")

        await Session.remove(session.id)
      },
    })
  })
})

describe("session.prompt special characters", () => {
  test("handles filenames with # character", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "file#name.txt"), "special content\n")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const template = "Read @file#name.txt"
        const parts = await SessionPrompt.resolvePromptParts(template)
        const fileParts = parts.filter((part) => part.type === "file")

        expect(fileParts.length).toBe(1)
        expect(fileParts[0]!.filename).toBe("file#name.txt")
        expect(fileParts[0]!.url).toContain("%23")

        const decodedPath = fileURLToPath(fileParts[0]!.url)
        expect(decodedPath).toBe(path.join(tmp.path, "file#name.txt"))

        const message = await SessionPrompt.prompt({
          sessionID: session.id,
          parts,
          noReply: true,
        })
        const stored = await MessageV2.get({ sessionID: session.id, messageID: message.info.id })
        const textParts = stored.parts.filter((part) => part.type === "text")
        const hasContent = textParts.some((part) => part.text.includes("special content"))
        expect(hasContent).toBe(true)

        await Session.remove(session.id)
      },
    })
  })
})

describe("session.prompt agent variant", () => {
  test("applies agent variant only when using agent model", async () => {
    const prev = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = "test-openai-key"

    try {
      await using tmp = await tmpdir({
        git: true,
        config: {
          agent: {
            build: {
              model: "openai/gpt-5.2",
              variant: "xhigh",
            },
          },
        },
      })

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})

          const other = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            model: { providerID: "opencode", modelID: "kimi-k2.5-free" },
            noReply: true,
            parts: [{ type: "text", text: "hello" }],
          })
          if (other.info.role !== "user") throw new Error("expected user message")
          expect(other.info.variant).toBeUndefined()

          const match = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            noReply: true,
            parts: [{ type: "text", text: "hello again" }],
          })
          if (match.info.role !== "user") throw new Error("expected user message")
          expect(match.info.model).toEqual({ providerID: "openai", modelID: "gpt-5.2" })
          expect(match.info.variant).toBe("xhigh")

          const override = await SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            noReply: true,
            variant: "high",
            parts: [{ type: "text", text: "hello third" }],
          })
          if (override.info.role !== "user") throw new Error("expected user message")
          expect(override.info.variant).toBe("high")

          await Session.remove(session.id)
        },
      })
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = prev
    }
  })
})

describe("session.prompt available skills", () => {
  test("includes Agent Skills <available_skills> XML catalog", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skill", "xml-catalog-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: xml-catalog-skill
description: A skill for testing the XML catalog.
---

# XML Catalog Skill
`,
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockAgent = {
          id: "build",
          name: "build",
          tools: ["skill_load"],
          config: { skills: ["xml-catalog-skill"] },
        }

        const mockModel = { api: { id: "gpt-5.2" }, providerID: "openai" }

        const sections = await SystemPrompt.build({ agent: mockAgent, model: mockModel })
        const skillSection = sections.find((s) => s.label === "Available Skills")
        expect(skillSection).toBeDefined()
        expect(skillSection!.content).toContain("<available_skills>")
        expect(skillSection!.content).toContain("<name>xml-catalog-skill</name>")
        expect(skillSection!.content).toContain("<description>A skill for testing the XML catalog.</description>")
        expect(skillSection!.content).toContain("<location>")
        expect(skillSection!.content).toContain("</available_skills>")
      },
    })
  })

  test("excludes skills with disable-model-invocation from the catalog", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const enabledDir = path.join(dir, ".opencode", "skill", "enabled-skill")
        await Bun.write(
          path.join(enabledDir, "SKILL.md"),
          `---
name: enabled-skill
description: An enabled skill.
---

# Enabled Skill
`,
        )
        const disabledDir = path.join(dir, ".opencode", "skill", "disabled-skill")
        await Bun.write(
          path.join(disabledDir, "SKILL.md"),
          `---
name: disabled-skill
description: A disabled skill.
disable-model-invocation: true
---

# Disabled Skill
`,
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const mockAgent = {
          id: "build",
          name: "build",
          tools: ["skill_load"],
          config: { skills: ["enabled-skill", "disabled-skill"] },
        }

        const mockModel = { api: { id: "gpt-5.2" }, providerID: "openai" }

        const sections = await SystemPrompt.build({ agent: mockAgent, model: mockModel })
        const skillSection = sections.find((s) => s.label === "Available Skills")
        expect(skillSection).toBeDefined()
        expect(skillSection!.content).toContain("<name>enabled-skill</name>")
        expect(skillSection!.content).not.toContain("<name>disabled-skill</name>")
      },
    })
  })
})

describe("session.prompt directory permissions", () => {
  test("includes directory permissions table when agent has path rules", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        agent: {
          build: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})

        // Mock agent with path permissions
        const mockAgent = {
          id: "build",
          name: "build",
          permission: [
            { permission: "path.write", pattern: "/tmp/project", action: "allow" },
            { permission: "path.read", pattern: "/tmp/project", action: "allow" },
          ],
        }

        const mockModel = {
          api: { id: "gpt-5.2" },
          providerID: "openai",
        }

        const sections = await SystemPrompt.build({
          agent: mockAgent,
          model: mockModel,
          sessionID: session.id,
        })

        const dirSection = sections.find((s) => s.label === "Directory Permissions")
        expect(dirSection).toBeDefined()
        expect(dirSection?.content).toContain("Directory Permissions")
        expect(dirSection?.content).toContain("/tmp/project")
        expect(dirSection?.content).toContain("write")

        await Session.remove(session.id)
      },
    })
  })

  test("includes session working directory even without path rules", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        agent: {
          build: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})

        // Mock agent without path permissions
        const mockAgent = {
          id: "build",
          name: "build",
          permission: [
            { permission: "bash", pattern: "*", action: "ask" },
          ],
        }

        const mockModel = {
          api: { id: "gpt-5.2" },
          providerID: "openai",
        }

        const sections = await SystemPrompt.build({
          agent: mockAgent,
          model: mockModel,
          sessionID: session.id,
        })

        const dirSection = sections.find((s) => s.label === "Directory Permissions")
        expect(dirSection).toBeDefined()
        expect(dirSection?.content).toContain("Directory Permissions")
        expect(dirSection?.content).toContain("working directory")

        await Session.remove(session.id)
      },
    })
  })

  test("does not include directory permissions table when no session or path rules", async () => {
    // Mock agent without path permissions and no session
    const mockAgent = {
      id: "build",
      name: "build",
      permission: [
        { permission: "bash", pattern: "*", action: "ask" },
      ],
    }

    const mockModel = {
      api: { id: "gpt-5.2" },
      providerID: "openai",
    }

    const sections = await SystemPrompt.build({
      agent: mockAgent,
      model: mockModel,
    })

    const dirSection = sections.find((s) => s.label === "Directory Permissions")
    expect(dirSection).toBeUndefined()
  })
})
