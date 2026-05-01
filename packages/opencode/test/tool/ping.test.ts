import { describe, expect, test } from "bun:test"
import { PingTool } from "../../src/tool/ping"
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

describe("tool.ping", () => {
  test("pings an agent main session without creating a new session", async () => {
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
        const tool = await PingTool.init()

        const result = await tool.execute(
          {
            route: "agent_main",
            agent: "plan",
            prompt: "Keep this in the main planning thread",
            mode: "async",
            reply_to: parent.id,
          },
          { ...ctx, sessionID: parent.id },
        )

        const sessionId = /session_id: (.+)/.exec(result.output)?.[1]
        expect(sessionId).toBeTruthy()

        const mainSession = await Session.get(sessionId!)
        expect(mainSession.sessionType).toBe("role")
        expect(mainSession.agentID).toBe("plan")
        expect(mainSession.parentID).toBeUndefined()
        expect(result.metadata.created).toBe(false)
        expect(result.metadata.route).toBe("agent_main")
      },
    })
  })

  test("creates a child session and pings it without waiting", async () => {
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
        const tool = await PingTool.init()

        const result = await tool.execute(
          {
            route: "new_child_session",
            agent: "build",
            prompt: "Implement the next step",
            mode: "async",
            reply_to: parent.id,
            description: "Spawn build child",
          },
          { ...ctx, sessionID: parent.id },
        )

        const sessionId = /session_id: (.+)/.exec(result.output)?.[1]
        expect(sessionId).toBeTruthy()

        const child = await Session.get(sessionId!)
        expect(child.parentID).toBe(parent.id)
        expect(child.agentID).toBe("build")
        expect(child.sessionType).toBe("worker")
        expect(result.metadata.created).toBe(true)
        expect(result.metadata.route).toBe("new_child_session")
      },
    })
  })

  test("reuses an existing session by id", async () => {
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
        const target = await Session.create({
          title: "existing target",
          parentID: parent.id,
          agentID: "plan",
        })
        const tool = await PingTool.init()

        const result = await tool.execute(
          {
            route: "existing_session",
            session_id: target.id,
            prompt: "Update the existing thread",
            mode: "async",
            reply_to: parent.id,
          },
          { ...ctx, sessionID: parent.id },
        )

        const messageId = /message_id: (.+)/.exec(result.output)?.[1]
        expect(messageId).toBeTruthy()

        const message = await MessageV2.get({ sessionID: target.id, messageID: messageId! })
        expect(message.info.role).toBe("user")
        expect(message.parts.some((part) => part.type === "text" && part.text.includes("Update the existing thread"))).toBe(
          true,
        )
        expect(result.metadata.created).toBe(false)
        expect(result.metadata.route).toBe("existing_session")
      },
    })
  })
})