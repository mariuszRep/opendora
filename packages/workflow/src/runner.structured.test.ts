import { describe, expect, test, mock } from "bun:test"

const promptMock = mock(async (_input: any) => ({ parts: [] }) as any)

mock.module("@projectflows/session/prompt", () => ({
  SessionPrompt: { prompt: promptMock },
}))

const { agentStructuredJson } = await import("./runner.ts")

describe("agentStructuredJson", () => {
  const schema = {
    type: "object",
    properties: {
      status: { type: "string" },
      count: { type: "integer" },
    },
    required: ["status", "count"],
  }

  test("requests hidden plain text JSON instead of a forced tool call", async () => {
    promptMock.mockImplementation(async () => ({ parts: [{ type: "text", text: '{"status":"ok","count":2}' }] }) as any)

    await agentStructuredJson("session-1", "Return a marker", schema)

    const call = promptMock.mock.calls.at(-1)![0]
    expect(call.format).toEqual({ type: "text", toolChoice: "none" })
    expect(call.hidden).toBe(true)
  })

  test("returns JSON emitted as ordinary text", async () => {
    promptMock.mockImplementation(async () => ({ parts: [{ type: "text", text: '{"status":"STRUCTURED_NODE_OK","count":2}' }] }) as any)

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).resolves.toEqual({
      status: "STRUCTURED_NODE_OK",
      count: 2,
    })
  })

  test("accepts JSON in a fenced response", async () => {
    promptMock.mockImplementation(async () => ({ parts: [{ type: "text", text: 'Here is the result:\n```json\n{"status":"ok","count":2}\n```' }] }) as any)

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).resolves.toEqual({ status: "ok", count: 2 })
  })

  test("rejects malformed JSON", async () => {
    promptMock.mockImplementation(async () => ({ parts: [{ type: "text", text: '{"status":' }] }) as any)

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).rejects.toThrow("valid JSON")
  })

  test("rejects JSON that does not satisfy required fields and types", async () => {
    promptMock.mockImplementation(async () => ({ parts: [{ type: "text", text: '{"status":"ok","count":"2"}' }] }) as any)

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).rejects.toThrow("$output.count must be an integer")
  })

  test("forwards a model override", async () => {
    promptMock.mockImplementation(async () => ({ parts: [{ type: "text", text: '{"status":"ok","count":2}' }] }) as any)

    await agentStructuredJson("session-1", "Return a marker", schema, { providerID: "anthropic", modelID: "claude-sonnet-5" })

    expect(promptMock.mock.calls.at(-1)![0].model).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-5" })
  })
})
