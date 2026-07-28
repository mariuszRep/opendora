import { describe, expect, test, mock, beforeEach } from "bun:test"

// ─── Structured node retry (nd.retry) ─────────────────────────────────────────
// agentStructuredJson() already retries internally (strict schema-forced call,
// then a prose+regex fallback) — both synchronous, no delay between them (see
// runner.structured.test.ts). This exercises the outer, node-level retry: a
// Structured node with a `retry: {maxAttempts, delaySeconds}` config (the same
// shape already supported by Tool/RunWorkflow nodes, see
// runner.run-workflow.test.ts's "retried per the node's own retry policy" test)
// re-runs the whole agentStructuredJson() call — including its own internal
// strict+fallback attempts — after a transient failure, rather than failing the
// node immediately.

mock.module("@projectflows/session/session", () => ({
  Session: {
    effectiveDefaultPath: async () => "/tmp/structured-retry-test",
    setCwd: async () => {},
    setWorkflowRun: async () => {},
    updateMessage: async (msg: unknown) => msg,
    updatePart: async () => {},
    get: async () => ({ agentID: "test-agent" }),
    close: async () => {},
  },
}))

mock.module("@projectflows/session/status", () => ({
  SessionStatus: { set: () => {} },
}))

mock.module("./checkpoint-store.ts", () => ({
  CheckpointStore: {
    getLatest: async () => null,
    append: async () => {},
    complete: async () => {},
    markError: async () => {},
  },
  registerActiveRun: () => {},
  deregisterActiveRun: () => {},
}))

const promptMock = mock(async (_input: any) => ({ info: {} }) as any)

mock.module("@projectflows/session/prompt", () => ({
  SessionPrompt: { prompt: promptMock },
}))

const { runWorkflowDetailed } = await import("./runner.ts")

function structuredNode(
  nodeId: string,
  schema: Record<string, unknown>,
  retry?: { maxAttempts?: number; delaySeconds?: number },
) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: {
      nodeType: "structured",
      node: { label: nodeId, parameters: { output: "structured_result" }, ...(retry ? { retry } : {}) },
      instructions: "Say something structured.",
      outputSchema: schema,
    },
    position: { x: 0, y: 0 },
  }
}

function outputNode(nodeId: string, fields: Record<string, unknown>) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: { nodeType: "output", node: { label: nodeId, parameters: { fields } } },
    position: { x: 0, y: 0 },
  }
}

function edge(source: string, target: string) {
  return { id: `${source}->${target}`, source, target }
}

beforeEach(() => {
  promptMock.mockClear()
})

const schema = { type: "object", properties: { status: { type: "string" } }, required: ["status"] }

describe("structured node retry (nd.retry)", () => {
  test("no retry config: a failing structured call fails the node after its single attempt", async () => {
    promptMock.mockImplementation(async () => ({ info: {}, parts: [{ type: "text", text: "not json" }] }) as any)

    const workflow = {
      id: "wf-no-retry",
      name: "No Retry",
      version: "1.0.0",
      nodes: [structuredNode("s", schema), outputNode("out", { r: "$ctx.structured_result" })],
      edges: [edge("s", "out")],
    }

    const result = await runWorkflowDetailed({ workflow: workflow as any, sessionId: "sess-1", input: {}, directory: "/tmp" })
    expect((result.outputObject as any).status.completed).toBe(false)
    // Each agentStructuredJson() call is itself 2 prompt calls (strict + fallback);
    // with maxAttempts defaulting to 1, the node makes exactly one such call.
    expect(promptMock).toHaveBeenCalledTimes(2)
  })

  test("with retry config: a transient failure is retried and the node succeeds", async () => {
    let structuredCallCount = 0
    promptMock.mockImplementation(async () => {
      // Each agentStructuredJson() attempt starts with a fresh strict-path call.
      structuredCallCount++
      if (structuredCallCount <= 4) {
        // First two full agentStructuredJson attempts (strict + fallback each) fail.
        return { info: {}, parts: [{ type: "text", text: "not json" }] } as any
      }
      return { info: { structured: { status: "STRUCTURED_RETRY_OK" } } } as any
    })

    const workflow = {
      id: "wf-retry",
      name: "Retry",
      version: "1.0.0",
      nodes: [structuredNode("s", schema, { maxAttempts: 3, delaySeconds: 0 }), outputNode("out", { r: "$ctx.structured_result" })],
      edges: [edge("s", "out")],
    }

    const result = await runWorkflowDetailed({ workflow: workflow as any, sessionId: "sess-2", input: {}, directory: "/tmp" })
    expect((result.outputObject as any).status.completed).toBe(true)
    expect((result.outputObject as any).result).toEqual({ r: { status: "STRUCTURED_RETRY_OK" } })
    // 2 failed full attempts (2 prompt calls each) + 1 succeeding attempt (1 prompt call, strict path hits).
    expect(structuredCallCount).toBe(5)
  })

  test("retry does not apply once maxAttempts is exhausted", async () => {
    promptMock.mockImplementation(async () => ({ info: {}, parts: [{ type: "text", text: "not json" }] }) as any)

    const workflow = {
      id: "wf-exhausted",
      name: "Exhausted",
      version: "1.0.0",
      nodes: [structuredNode("s", schema, { maxAttempts: 2, delaySeconds: 0 }), outputNode("out", { r: "$ctx.structured_result" })],
      edges: [edge("s", "out")],
    }

    const result = await runWorkflowDetailed({ workflow: workflow as any, sessionId: "sess-3", input: {}, directory: "/tmp" })
    expect((result.outputObject as any).status.completed).toBe(false)
    // 2 attempts, each a full strict+fallback agentStructuredJson call (2 prompt calls).
    expect(promptMock).toHaveBeenCalledTimes(4)
  })
})
