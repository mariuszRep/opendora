import { describe, expect, test, mock, beforeEach } from "bun:test"

// ─── agentStructuredJson: schema-enforced output path with prose fallback ─────
// The schema-enforced json_schema/createStructuredOutputTool mechanism is tried
// first — it's validated by the AI SDK tool-call machinery upstream
// (packages/session/src/prompt.ts), so it's strictly more reliable than text
// parsing when the provider honors forced tool_choice. But that mechanism's
// "already tested" coverage (structured-output-integration.test.ts) only ever
// exercises Anthropic models; providers like kilo and openai-codex have been
// observed live not to reliably comply with forced tool_choice — the model
// either responds with plain text or even a hallucinated fake tool-call written
// as text. So agentStructuredJson() retries once with the old prose+regex
// approach before giving up, rather than failing the whole node outright.
//
// SessionPrompt.prompt is mocked here because it requires a live session/DB
// and model provider — this test exercises exactly the logic that changed:
// how agentStructuredJson() interprets SessionPrompt.prompt's return value,
// and when it falls back to a second call.

const promptMock = mock(async (_input: any) => ({ info: {} }) as any)

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

  beforeEach(() => {
    promptMock.mockClear()
  })

  test("calls SessionPrompt.prompt with format:json_schema first", async () => {
    promptMock.mockImplementation(async () => ({ info: { structured: { ok: true } } }) as any)

    await agentStructuredJson("session-1", "Extract the thing", { type: "object", properties: {} })

    expect(promptMock).toHaveBeenCalledTimes(1)
    const call = promptMock.mock.calls[0]![0] as any
    expect(call.format).toEqual({
      type: "json_schema",
      schema: { type: "object", properties: {} },
      toolName: "workflow_structured",
      retryCount: 2,
    })
    expect(call.hidden).toBe(true)
  })

  test("marks the fallback call hidden too — the node card is the only visible record", async () => {
    let call = 0
    promptMock.mockImplementation(async () => {
      call++
      if (call === 1) return { info: {} } as any
      return { parts: [{ type: "text", text: '{"status":"ok","count":1}' }] } as any
    })

    await agentStructuredJson("session-1", "Return a marker", schema)

    expect(promptMock.mock.calls[0]![0].hidden).toBe(true)
    expect(promptMock.mock.calls[1]![0].hidden).toBe(true)
  })

  test("returns the captured structured result without falling back", async () => {
    promptMock.mockImplementation(async () => ({ info: { structured: { status: "STRUCTURED_NODE_OK", count: 2 } } }) as any)

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).resolves.toEqual({
      status: "STRUCTURED_NODE_OK",
      count: 2,
    })
    expect(promptMock).toHaveBeenCalledTimes(1)
  })

  test("returns the structured result even when the model also emitted surrounding prose", async () => {
    // The old regex approach was fragile on exactly this case — a preamble
    // sentence before the JSON could make extraction grab the wrong thing or
    // nothing. The strict path is unaffected because the schema-validated tool
    // call itself is the result; prose text alongside it never enters here.
    promptMock.mockImplementation(async () => ({ info: { structured: { status: "ok", count: 2 } } }) as any)

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).resolves.toEqual({ status: "ok", count: 2 })
  })

  test("falls back to prose+regex extraction when the strict path produces no structured output", async () => {
    let call = 0
    promptMock.mockImplementation(async () => {
      call++
      if (call === 1) return { info: {} } as any // strict path: model didn't call the tool
      return { parts: [{ type: "text", text: 'Here you go:\n```json\n{"status":"ok","count":3}\n```' }] } as any // fallback: fenced JSON
    })

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).resolves.toEqual({ status: "ok", count: 3 })
    expect(promptMock).toHaveBeenCalledTimes(2)
    const fallbackCall = promptMock.mock.calls[1]![0] as any
    expect(fallbackCall.format).toEqual({ type: "text", toolChoice: "none" })
  })

  test("falls back successfully even when the strict path surfaced a typed error", async () => {
    let call = 0
    promptMock.mockImplementation(async () => {
      call++
      if (call === 1) return { info: { error: { name: "StructuredOutputError", data: { message: "Model did not produce structured output" } } } } as any
      return { parts: [{ type: "text", text: '{"status":"ok","count":1}' }] } as any
    })

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).resolves.toEqual({ status: "ok", count: 1 })
  })

  test("throws the strict path's error when both the strict and fallback paths fail", async () => {
    promptMock.mockImplementation(async () => ({
      info: { error: { name: "StructuredOutputError", data: { message: "Model did not produce structured output" } } },
      parts: [{ type: "text", text: "I can't help with that." }],
    }) as any)

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).rejects.toThrow(
      "Model did not produce structured output",
    )
  })

  test("throws a generic message when neither path produces structured output nor a typed error", async () => {
    promptMock.mockImplementation(async () => ({ info: {}, parts: [{ type: "text", text: "not json" }] }) as any)

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).rejects.toThrow(
      "Structured node: model did not produce structured output",
    )
  })

  test("fallback result is still validated against the schema", async () => {
    let call = 0
    promptMock.mockImplementation(async () => {
      call++
      if (call === 1) return { info: {} } as any
      // count should be an integer per the schema, but the model emitted a string
      return { parts: [{ type: "text", text: '{"status":"ok","count":"three"}' }] } as any
    })

    await expect(agentStructuredJson("session-1", "Return a marker", schema)).rejects.toThrow(
      "Structured node: model did not produce structured output",
    )
  })

  test("forwards a model override to both the strict and fallback calls", async () => {
    let call = 0
    promptMock.mockImplementation(async () => {
      call++
      if (call === 1) return { info: {} } as any
      return { parts: [{ type: "text", text: '{"status":"ok","count":2}' }] } as any
    })

    await agentStructuredJson("session-1", "Return a marker", schema, { providerID: "anthropic", modelID: "claude-sonnet-5" })

    expect(promptMock.mock.calls[0]![0].model).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-5" })
    expect(promptMock.mock.calls[1]![0].model).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-5" })
  })
})
