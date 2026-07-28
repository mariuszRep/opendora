import { describe, expect, test, mock } from "bun:test"

// ─── Sandbox-mode contract ──────────────────────────────────────────────────
// workflow_sandbox_run (registry/tools/workflows/src/workflow-sandbox-run.ts) lets an
// agent test a node/edge snippet through the real runSubGraph execution path before
// wiring it into a persisted workflow. These tests exercise the two knobs that make
// that possible: `seedCtx` (mock predecessor output for refs the snippet doesn't
// itself produce) and `sandbox: true` (must leave zero trace — no checkpoint writes,
// no active-run tracking — since the "workflow" here was never persisted and may be
// thrown away immediately).

const checkpointGetLatest = mock(async () => null)
const checkpointAppend = mock(async () => {})
const checkpointComplete = mock(async () => {})
const checkpointMarkError = mock(async () => {})
const registerActiveRunMock = mock(() => {})
const deregisterActiveRunMock = mock(() => {})

mock.module("@projectflows/session/session", () => ({
  Session: {
    effectiveDefaultPath: async () => "/tmp/sandbox-test",
    setCwd: async () => {},
    setWorkflowRun: async () => {},
    updateMessage: async (msg: unknown) => msg,
    updatePart: async () => {},
    get: async () => ({ agentID: "test-agent" }),
  },
}))

mock.module("@projectflows/session/status", () => ({
  SessionStatus: { set: () => {} },
}))

mock.module("./checkpoint-store.ts", () => ({
  CheckpointStore: {
    getLatest: checkpointGetLatest,
    append: checkpointAppend,
    complete: checkpointComplete,
    markError: checkpointMarkError,
  },
  registerActiveRun: registerActiveRunMock,
  deregisterActiveRun: deregisterActiveRunMock,
}))

const { runWorkflowDetailed } = await import("./runner.ts")

let nextId = 0
function id(prefix: string) {
  return `${prefix}_${nextId++}`
}

function outputNode(nodeId: string, fields: Record<string, unknown>) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: { nodeType: "output", node: { label: nodeId, parameters: { fields } } },
    position: { x: 0, y: 0 },
  }
}

function parametersNode(nodeId: string, params: Array<{ name: string; required?: boolean }>) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: { nodeType: "parameters", node: { label: nodeId, parameters: {} }, workflowParameters: params },
    position: { x: 0, y: 0 },
  }
}

describe("sandbox mode", () => {
  test("seedCtx values are resolvable via $ref, just like a real predecessor's output", async () => {
    const workflow = {
      id: id("sandbox-wf"),
      name: "Sandbox Seed Test",
      version: "0.0.0",
      nodes: [outputNode("out", { result: "$seeded" })],
      edges: [],
    }

    const result = await runWorkflowDetailed({
      workflow: workflow as any,
      sessionId: id("sandbox-session"),
      input: {},
      directory: "/tmp",
      seedCtx: { seeded: "mocked-predecessor-output" },
      sandbox: true,
    })

    const outputObject = result.outputObject as any
    expect(outputObject.status.completed).toBe(true)
    expect(outputObject.result.result).toBe("mocked-predecessor-output")
  })

  test("sandbox mode writes no checkpoints and tracks no active run, on success or failure", async () => {
    checkpointGetLatest.mockClear()
    checkpointAppend.mockClear()
    checkpointComplete.mockClear()
    checkpointMarkError.mockClear()
    registerActiveRunMock.mockClear()
    deregisterActiveRunMock.mockClear()

    const passingWorkflow = {
      id: id("sandbox-wf"),
      name: "Sandbox Pass",
      version: "0.0.0",
      nodes: [outputNode("out", { ok: "true" })],
      edges: [],
    }
    const passResult = await runWorkflowDetailed({
      workflow: passingWorkflow as any,
      sessionId: id("sandbox-session"),
      input: {},
      directory: "/tmp",
      sandbox: true,
    })
    expect((passResult.outputObject as any).status.completed).toBe(true)

    const failingWorkflow = {
      id: id("sandbox-wf"),
      name: "Sandbox Fail",
      version: "0.0.0",
      nodes: [parametersNode("p", [{ name: "must_have", required: true }])],
      edges: [],
    }
    const failResult = await runWorkflowDetailed({
      workflow: failingWorkflow as any,
      sessionId: id("sandbox-session"),
      input: {},
      directory: "/tmp",
      sandbox: true,
    })

    // A failing node must be reported as data, not thrown — the whole point of the
    // sandbox is to observe pass/fail without an exception aborting the caller.
    expect((failResult.outputObject as any).status.completed).toBe(false)

    expect(checkpointGetLatest).not.toHaveBeenCalled()
    expect(checkpointAppend).not.toHaveBeenCalled()
    expect(checkpointComplete).not.toHaveBeenCalled()
    expect(checkpointMarkError).not.toHaveBeenCalled()
    expect(registerActiveRunMock).not.toHaveBeenCalled()
    expect(deregisterActiveRunMock).not.toHaveBeenCalled()
  })

  test("non-sandbox runs are unaffected — checkpoint completion still fires as before", async () => {
    checkpointGetLatest.mockClear()
    checkpointComplete.mockClear()
    registerActiveRunMock.mockClear()
    deregisterActiveRunMock.mockClear()

    const workflow = {
      id: id("real-wf"),
      name: "Real Run",
      version: "0.0.0",
      nodes: [outputNode("out", { ok: "true" })],
      edges: [],
    }
    const result = await runWorkflowDetailed({
      workflow: workflow as any,
      sessionId: id("real-session"),
      input: {},
      directory: "/tmp",
    })

    expect((result.outputObject as any).status.completed).toBe(true)
    expect(checkpointGetLatest).toHaveBeenCalled()
    expect(checkpointComplete).toHaveBeenCalled()
    expect(registerActiveRunMock).toHaveBeenCalled()
    expect(deregisterActiveRunMock).toHaveBeenCalled()
  })
})
