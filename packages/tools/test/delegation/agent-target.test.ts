import { describe, expect, test } from "bun:test"
import type { Tool } from "@projectflows/tools/tool"
import { createAgentTargetTool } from "@projectflows/tools/delegation/agent-target"

const baseCtx: Omit<Tool.Context, "ask" | "extra"> = {
  sessionID: "asker-session",
  messageID: "msg-asker",
  callID: "call-1",
  agent: "coordinator",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
}

function makeCtx(extra: Record<string, any>): Tool.Context {
  return { ...baseCtx, extra, ask: async () => {} }
}

describe("delegation.agent-target sync failure surfacing", () => {
  test("includes the child's error in the returned output instead of an empty spawn_result", async () => {
    const tool = createAgentTargetTool({ id: "worker", name: "Worker" })
    const toolInfo = await tool.init()

    const ctx = makeCtx({
      session: {
        get: async () => ({}),
        createNext: async () => ({ id: "child-session-1" }),
      },
      resolvePromptParts: async (text: string) => [{ type: "text", text }],
      prompt: async () => ({
        info: {
          id: "child-msg-1",
          error: {
            name: "APIError",
            data: { message: "The provider returned a 500 error", isRetryable: true },
          },
        },
        parts: [],
      }),
    })

    const result = await toolInfo.execute({ prompt: "do the task", mode: "sync" }, ctx)

    expect(result.output).toContain("ERROR")
    expect(result.output).toContain("The provider returned a 500 error")
  })

  test("does not force structured output — result_schema is not an accepted parameter", async () => {
    const tool = createAgentTargetTool({ id: "worker", name: "Worker" })
    const toolInfo = await tool.init()

    let receivedFormat: unknown = "unset"
    const ctx = makeCtx({
      session: {
        get: async () => ({}),
        createNext: async () => ({ id: "child-session-3" }),
      },
      resolvePromptParts: async (text: string) => [{ type: "text", text }],
      prompt: async (opts: any) => {
        receivedFormat = opts.format
        return { info: { id: "child-msg-3" }, parts: [{ type: "text", text: "prose reply" }] }
      },
    })

    // result_schema is passed anyway (e.g. by a stale caller) — it must be silently ignored,
    // not forwarded as a forced json_schema format.
    await toolInfo.execute({ prompt: "do the task", result_schema: "default", mode: "sync" } as any, ctx)

    expect(receivedFormat).toBeUndefined()
  })

  test("omits the ERROR line and returns the child's text when there is no error", async () => {
    const tool = createAgentTargetTool({ id: "worker", name: "Worker" })
    const toolInfo = await tool.init()

    const ctx = makeCtx({
      session: {
        get: async () => ({}),
        createNext: async () => ({ id: "child-session-2" }),
      },
      resolvePromptParts: async (text: string) => [{ type: "text", text }],
      prompt: async () => ({
        info: { id: "child-msg-2" },
        parts: [{ type: "text", text: "all done" }],
      }),
    })

    const result = await toolInfo.execute({ prompt: "do the task", mode: "sync" }, ctx)

    expect(result.output).not.toContain("ERROR")
    expect(result.output).toContain("all done")
  })
})
