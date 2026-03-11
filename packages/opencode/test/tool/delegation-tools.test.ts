import { describe, expect, test } from "bun:test"
import { PingMainTool } from "../../src/tool/ping_main"
import { PingSessionTool } from "../../src/tool/ping_session"
import { SpawnSessionTool } from "../../src/tool/spawn_session"
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

describe("delegation tool set", () => {
  test("ping_main resolves an agent main role session", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: { agent: { plan: { model: "openai/gpt-5.2" } } },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const parent = await Session.create({ title: "parent" })
        const tool = await PingMainTool.init()
        const result = await tool.execute(
          { agent: "plan", prompt: "Continue planning", wait_for_reply: false },
          { ...ctx, sessionID: parent.id },
        )

        const sessionId = /session_id: (.+)/.exec(result.output)?.[1]
        const main = await Session.get(sessionId!)
        expect(main.sessionType).toBe("role")
        expect(main.agentID).toBe("plan")
      },
    })
  })

  test("ping_session posts into a known session", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: { agent: { plan: { model: "openai/gpt-5.2" } } },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const parent = await Session.create({ title: "parent" })
        const target = await Session.create({ title: "target", parentID: parent.id, agentID: "plan" })
        const tool = await PingSessionTool.init()
        const result = await tool.execute(
          { session_id: target.id, prompt: "Update this thread", wait_for_reply: false },
          { ...ctx, sessionID: parent.id },
        )

        const messageId = /message_id: (.+)/.exec(result.output)?.[1]
        const message = await MessageV2.get({ sessionID: target.id, messageID: messageId! })
        expect(message.parts.some((part) => part.type === "text" && part.text.includes("Update this thread"))).toBe(true)
      },
    })
  })

  test("spawn_session creates a child worker session", async () => {
    await using tmp = await tmpdir({
      git: true,
      config: { agent: { build: { model: "openai/gpt-5.2" } } },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const parent = await Session.create({ title: "parent" })
        const tool = await SpawnSessionTool.init()
        const result = await tool.execute(
          { route: "new_child_session", agent: "build", prompt: "Implement this", wait_for_reply: false },
          { ...ctx, sessionID: parent.id },
        )

        const sessionId = /session_id: (.+)/.exec(result.output)?.[1]
        const child = await Session.get(sessionId!)
        expect(child.parentID).toBe(parent.id)
        expect(child.sessionType).toBe("worker")
        expect(child.agentID).toBe("build")
      },
    })
  })
})
