import { describe, expect, test } from "bun:test"
import { DelegateTool } from "../../src/tool/delegate"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
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
            wait_for_reply: false,
            description: "Ask build agent",
          },
          { ...ctx, sessionID: parent.id },
        )

        const sessionId = /session_id: (.+)/.exec(result.output)?.[1]
        expect(sessionId).toBeTruthy()

        const delegated = await Session.get(sessionId!)
        expect(delegated.parentID).toBe(parent.id)
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
          parentID: parent.id,
          agentID: "plan",
        })
        const tool = await DelegateTool.init()

        const result = await tool.execute(
          {
            session_id: delegated.id,
            prompt: "Make a plan",
            wait_for_reply: false,
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
})
