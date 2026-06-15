import { describe, expect, test, beforeEach } from "bun:test"
import path from "path"
import { DelegateTool } from "@opendora/tools/communication/delegate"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { Skill } from "../../src/skill"
import { tmpdir } from "../fixture/fixture"

const ctx = {
  sessionID: "",
  messageID: "message_test",
  callID: "call_test",
  agent: "general",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

describe("tool.delegate", () => {
  test("creates a delegated child session and posts a message without waiting", async () => {
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
        const parent = await Session.create({ title: "parent" })
        const tool = await DelegateTool.init()

        const result = await tool.execute(
          {
            agent: "build",
            prompt: "Review the repository structure",
            mode: "async",
            reply_to: parent.id,
            description: "Ask build agent",
          },
          { ...ctx, sessionID: parent.id },
        )

        const sessionId = /session_id: (.+)/.exec(result.output)?.[1]
        expect(sessionId).toBeTruthy()

        const delegated = await Session.get(sessionId!)
        expect(delegated.parentSessionID).toBe(parent.id)
        expect(delegated.agentID).toBe("build")
        expect(result.metadata.created).toBe(true)
        expect(result.metadata.replied).toBe(false)
      },
    })
  })

  test("reuses an existing session and posts into it without creating a new one", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        agent: {
          plan: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const parent = await Session.create({ title: "parent" })
        const delegated = await Session.create({
          title: "plan session",
          parentSessionID: parent.id,
          agentID: "plan",
        })
        const tool = await DelegateTool.init()

        const result = await tool.execute(
          {
            session_id: delegated.id,
            prompt: "Make a plan",
            mode: "async",
            reply_to: parent.id,
          },
          { ...ctx, sessionID: parent.id },
        )

        const messageId = /message_id: (.+)/.exec(result.output)?.[1]
        expect(messageId).toBeTruthy()
        const message = await MessageV2.get({ sessionID: delegated.id, messageID: messageId! })

        expect(message.info.role).toBe("user")
        expect(message.parts.some((part) => part.type === "text" && part.text.includes("Make a plan"))).toBe(true)
        expect(result.metadata.created).toBe(false)
        expect(result.metadata.replied).toBe(false)
      },
    })
  })

  test("preloads skills when creating a new session with session_type", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        // Create a test skill
        const skillDir = path.join(dir, ".opencode", "skill", "test-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: test-skill
description: A test skill for delegation.
---

# Test Skill

Use this skill for testing.`,
        )
      },
      config: {
        agent: {
          build: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Verify skill exists
          const skills = await Skill.all()
          expect(skills.find((s) => s.name === "test-skill")).toBeDefined()

          const parent = await Session.create({ title: "parent" })
          const tool = await DelegateTool.init()

          const result = await tool.execute(
            {
              agent: "build",
              session_type: "worker",
              title: "Task with skill",
              prompt: "Do something",
              skills: ["test-skill"],
              mode: "async",
              reply_to: parent.id,
            },
            { ...ctx, sessionID: parent.id },
          )

          const sessionId = /session_id: (.+)/.exec(result.output)?.[1]
          expect(sessionId).toBeTruthy()

          // Verify skills were preloaded
          expect(result.output).toContain("skills_preloaded: test-skill")
          expect(result.metadata.skillsPreloaded).toEqual(["test-skill"])
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("preloads skills for self-delegation (creates worker session)", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        // Create a test skill
        const skillDir = path.join(dir, ".opencode", "skill", "self-test-skill")
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: self-test-skill
description: A skill for self-delegation testing.
---

# Self Test Skill

This skill is used in self-delegation.`,
        )
      },
      config: {
        agent: {
          general: {
            model: "openai/gpt-5.2",
          },
          build: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Get the general agent's main session (this will be the same as the current session for self-delegation)
          const parent = await Session.create({ title: "parent" })
          
          // Create a session for general agent that matches the parent
          const generalMainSession = await Session.create({
            title: "general main",
            sessionType: "role",
            agentID: "general",
          })

          const tool = await DelegateTool.init()

          // Self-delegation: delegate to "general" when we're already in their main session
          // This should create a worker child session
          const result = await tool.execute(
            {
              agent: "general",
              prompt: "Do something with skill",
              skills: ["self-test-skill"],
              mode: "async",
              reply_to: parent.id,
            },
            { ...ctx, sessionID: generalMainSession.id, agent: "general" },
          )

          // Should have created a new worker session
          const sessionId = /session_id: (.+)/.exec(result.output)?.[1]
          expect(sessionId).toBeTruthy()
          
          // Verify route is self_subsession
          expect(result.output).toContain("route: self_subsession")
          
          // Verify skills were preloaded
          expect(result.output).toContain("skills_preloaded: self-test-skill")
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })

  test("fails when skills parameter is used with session_id (existing session)", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: {
        agent: {
          plan: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const parent = await Session.create({ title: "parent" })
        const delegated = await Session.create({
          title: "plan session",
          parentSessionID: parent.id,
          agentID: "plan",
        })
        const tool = await DelegateTool.init()

        // Attempting to use skills with session_id should fail validation
        await expect(
          tool.execute(
            {
              session_id: delegated.id,
              prompt: "Make a plan",
              skills: ["some-skill"],
              mode: "async",
              reply_to: parent.id,
            },
            { ...ctx, sessionID: parent.id },
          ),
        ).rejects.toThrow("skills cannot be used with session_id")
      },
    })
  })

  test("fails when requested skill does not exist", async () => {
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
        const parent = await Session.create({ title: "parent" })
        const tool = await DelegateTool.init()

        // Attempting to preload a non-existent skill should fail
        await expect(
          tool.execute(
            {
              agent: "build",
              session_type: "worker",
              title: "Task with missing skill",
              prompt: "Do something",
              skills: ["non-existent-skill"],
              mode: "async",
              reply_to: parent.id,
            },
            { ...ctx, sessionID: parent.id },
          ),
        ).rejects.toThrow("Skill \"non-existent-skill\" not found")
      },
    })
  })

  test("allows multiple skills to be preloaded", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        // Create multiple test skills
        const skillDir1 = path.join(dir, ".opencode", "skill", "skill-one")
        await Bun.write(
          path.join(skillDir1, "SKILL.md"),
          `---
name: skill-one
description: First test skill.
---

# Skill One`,
        )
        const skillDir2 = path.join(dir, ".opencode", "skill", "skill-two")
        await Bun.write(
          path.join(skillDir2, "SKILL.md"),
          `---
name: skill-two
description: Second test skill.
---

# Skill Two`,
        )
      },
      config: {
        agent: {
          build: {
            model: "openai/gpt-5.2",
          },
        },
      },
    })

    const home = process.env.OPENCODE_TEST_HOME
    process.env.OPENCODE_TEST_HOME = tmp.path

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const parent = await Session.create({ title: "parent" })
          const tool = await DelegateTool.init()

          const result = await tool.execute(
            {
              agent: "build",
              session_type: "worker",
              title: "Task with multiple skills",
              prompt: "Do something",
              skills: ["skill-one", "skill-two"],
              mode: "async",
              reply_to: parent.id,
            },
            { ...ctx, sessionID: parent.id },
          )

          // Verify both skills were preloaded
          expect(result.output).toContain("skills_preloaded: skill-one, skill-two")
          expect(result.metadata.skillsPreloaded).toEqual(["skill-one", "skill-two"])
        },
      })
    } finally {
      process.env.OPENCODE_TEST_HOME = home
    }
  })
})