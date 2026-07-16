import { describe, expect, test, mock } from "bun:test"

// ─── agentStructuredJson: schema-enforced output path ─────────────────────────
// Regression coverage for the fix that replaced prose + regex JSON extraction
// with the real json_schema/createStructuredOutputTool mechanism. The old
// extractJsonFromText approach depended on the model's response being (close
// to) bare JSON — a preamble sentence or a second brace-balanced block could
// make it extract the wrong thing, or nothing, with no schema validation at
// all. The new path is validated by the AI SDK tool-call machinery upstream
// (packages/session/src/prompt.ts), so agentStructuredJson() only has to read
// the captured result off the assistant message.
//
// SessionPrompt.prompt is mocked here because it requires a live session/DB
// and model provider — this test exercises exactly the logic that changed:
// how agentStructuredJson() interprets SessionPrompt.prompt's return value.

const promptMock = mock(async (_input: any) => ({ info: {} }) as any)

mock.module("@projectflows/session/prompt", () => ({
  SessionPrompt: { prompt: promptMock },
}))

const { agentStructuredJson } = await import("./runner.ts")

describe("agentStructuredJson", () => {
  test("calls SessionPrompt.prompt with format:json_schema, not text+toolChoice:none", async () => {
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
  })

  test("returns the validated structured object when the model calls the tool cleanly", async () => {
    promptMock.mockImplementation(async () => ({ info: { structured: { name: "Anthropic", founded: 2021 } } }) as any)

    const result = await agentStructuredJson("session-1", "Extract company info", { type: "object", properties: {} })
    expect(result).toEqual({ name: "Anthropic", founded: 2021 })
  })

  test("returns the structured object even when the model also emitted surrounding prose", async () => {
    // This is exactly the case the old regex-based extractJsonFromText was fragile on:
    // a text response like "Sure, here's the JSON: {...} Let me know if you need changes."
    // could extract the wrong substring or fail outright. With schema-enforced tool-call
    // output, any surrounding text is irrelevant — the structured value comes from the
    // validated tool call, not from parsing the free-text response.
    promptMock.mockImplementation(async () => ({
      info: {
        structured: { events: ["Event A", "Event B"] },
      },
    }) as any)

    const result = await agentStructuredJson(
      "session-1",
      "List the events",
      { type: "object", properties: { events: { type: "array", items: { type: "string" } } } },
    )
    expect(result).toEqual({ events: ["Event A", "Event B"] })
  })

  test("throws with the StructuredOutputError message when the model never produces structured output", async () => {
    promptMock.mockImplementation(async () => ({
      info: {
        error: { name: "StructuredOutputError", data: { message: "Model did not produce structured output", retries: 0 } },
      },
    }) as any)

    await expect(
      agentStructuredJson("session-1", "Extract the thing", { type: "object", properties: {} }),
    ).rejects.toThrow("Model did not produce structured output")
  })

  test("throws a fallback message when neither structured nor a typed error is present", async () => {
    promptMock.mockImplementation(async () => ({ info: {} }) as any)

    await expect(
      agentStructuredJson("session-1", "Extract the thing", { type: "object", properties: {} }),
    ).rejects.toThrow("Structured node: model did not produce structured output")
  })

  test("forwards the model override when provided", async () => {
    promptMock.mockImplementation(async () => ({ info: { structured: {} } }) as any)

    await agentStructuredJson(
      "session-1",
      "Extract",
      { type: "object" },
      { providerID: "anthropic", modelID: "claude-sonnet-5" },
    )

    const call = promptMock.mock.calls.at(-1)![0] as any
    expect(call.model).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-5" })
  })
})
