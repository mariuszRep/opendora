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
  test("includes the child's structured-output error in the returned output instead of an empty spawn_result", async () => {
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
            name: "StructuredOutputError",
            data: { message: "Model did not produce structured output", retries: 2 },
          },
        },
        parts: [],
      }),
    })

    const result = await toolInfo.execute({ prompt: "do the task", result_schema: "default", mode: "sync" }, ctx)

    expect(result.output).toContain("ERROR")
    expect(result.output).toContain("Model did not produce structured output")
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
