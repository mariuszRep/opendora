import { describe, expect, test, mock, beforeEach } from "bun:test"
import type { ApprovalRequest } from "./executor.ts"

// ─── Session-scoped $ctx reference resolution ─────────────────────────────────
// Proves the runner's context-bloat fix end to end through the real runSubGraph
// node loop:
//   - an INLINE Prompt node renders $ctx references as compact pointers (the
//     producing output is already in the shared session history), NOT the full value;
//   - an ISOLATED Prompt node runs its model turn in a fresh child session
//     (Session.createNext) with the reference expanded to full text;
//   - the Decide node injects a compact key manifest, not JSON.stringify(ctx).
//
// Session/SessionPrompt/CheckpointStore are mocked (they need a live DB + provider).
// SessionPrompt.prompt is routed by prompt content so each node's captured text
// can be asserted independently.

const DOC = "THE_FULL_DOCUMENT_BODY"

let captured: Array<{ sessionID: string; text: string }> = []
let createNextCalls: Array<Record<string, unknown>> = []
let closedSessions: string[] = []

const promptMock = mock(async (input: any) => {
  const text = input.parts?.[0]?.text ?? ""
  captured.push({ sessionID: input.sessionID, text })
  if (text.includes("routing a workflow")) return { parts: [{ type: "text", text: "go_a" }] } as any
  if (text.includes("Summarize")) return { parts: [{ type: "text", text: "SECOND_OUT" }] } as any
  return { parts: [{ type: "text", text: DOC }] } as any // the upstream "first" node's output
})

mock.module("@projectflows/session/session", () => ({
  Session: {
    effectiveDefaultPath: async () => "/tmp/session-scope-test",
    setCwd: async () => {},
    setWorkflowRun: async () => {},
    updateMessage: async (m: unknown) => m,
    updatePart: async () => {},
    get: async () => ({ agentID: "test-agent" }),
    createNext: async (opts: Record<string, unknown>) => {
      createNextCalls.push(opts)
      return { id: "child-session-1", agentID: "test-agent" }
    },
    close: async (sessionID: string) => {
      closedSessions.push(sessionID)
      return { id: sessionID }
    },
  },
}))

mock.module("@projectflows/session/prompt", () => ({
  SessionPrompt: { prompt: promptMock },
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

const { runWorkflowDetailed, registerApprovalGate } = await import("./runner.ts")

let nextId = 0
const id = (p: string) => `${p}_${nextId++}`

function promptNode(nodeId: string, key: string, instructions: string, nodeExtra: Record<string, unknown> = {}) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: { nodeType: "prompt", node: { label: nodeId, key, ...nodeExtra }, instructions },
    position: { x: 0, y: 0 },
  }
}

function decideNode(nodeId: string, cases: string[]) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: {
      nodeType: "decide",
      node: { label: nodeId, parameters: { mode: "agent", cases: cases.map((label) => ({ label })) } },
    },
    position: { x: 0, y: 0 },
  }
}

const workflow = (nodes: any[], edges: any[]) => ({
  id: id("wf"),
  name: "scope-test",
  version: "1.0.0",
  nodes,
  edges,
})

beforeEach(() => {
  captured = []
  createNextCalls = []
  closedSessions = []
  promptMock.mockClear()
})

describe("inline node → pointer", () => {
  test("references an upstream output by pointer, not by inlining the full value", async () => {
    const first = promptNode("first", "first", "Produce a document.")
    const second = promptNode("second", "second", "Summarize this: $first")
    await runWorkflowDetailed({
      workflow: workflow([first, second], [{ id: "e1", source: "first", target: "second" }]),
      sessionId: "root-session",
      input: {},
      directory: "/tmp/session-scope-test",
    })

    const secondText = captured.find((c) => c.text.includes("Summarize"))!.text
    expect(secondText).not.toContain(DOC) // full value must NOT be inlined
    expect(secondText).toContain("first") // pointer names the producing step
    expect(createNextCalls).toHaveLength(0) // ran in the shared session
    expect(captured.every((c) => c.sessionID === "root-session")).toBe(true)
  })
})

describe("isolated node → full text in a child session", () => {
  test("expands the reference to full text and runs the turn in a createNext child session", async () => {
    const first = promptNode("first", "first", "Produce a document.")
    const second = promptNode("second", "second", "Summarize this: $first", { session_mode: "isolated" })
    await runWorkflowDetailed({
      workflow: workflow([first, second], [{ id: "e1", source: "first", target: "second" }]),
      sessionId: "root-session",
      input: {},
      directory: "/tmp/session-scope-test",
    })

    expect(createNextCalls).toHaveLength(1)
    expect(createNextCalls[0]!.parentSessionID).toBe("root-session")
    const secondCall = captured.find((c) => c.text.includes("Summarize"))!
    expect(secondCall.text).toContain(DOC) // fresh session → full text
    expect(secondCall.sessionID).toBe("child-session-1") // turn ran in the child session
    expect(closedSessions).toContain("child-session-1") // child closed, not left lingering
  })
})

describe("Decide node → input size-guard", () => {
  test("inlines small input values but manifests a pathologically large input", async () => {
    // Small input → values inlined (routing often depends on them).
    await runWorkflowDetailed({
      workflow: workflow([decideNode("router", ["go_a", "go_b"])], []),
      sessionId: "root-session",
      input: { kind: "urgent" },
      directory: "/tmp/session-scope-test",
    })
    let routeText = captured.find((c) => c.text.includes("routing a workflow"))!.text
    expect(routeText).toContain("urgent") // small input → value inlined

    // Large input → key manifest, raw value omitted.
    captured = []
    const big = "X".repeat(3000)
    await runWorkflowDetailed({
      workflow: workflow([decideNode("router2", ["go_a", "go_b"])], []),
      sessionId: "root-session",
      input: { blob: big },
      directory: "/tmp/session-scope-test",
    })
    routeText = captured.find((c) => c.text.includes("routing a workflow"))!.text
    expect(routeText).not.toContain(big) // large raw value must NOT be dumped
    expect(routeText).toContain("Input parameters (keys):")
    expect(routeText).toContain("- blob: string")
  })
})

describe("Decide node → compact manifest", () => {
  test("injects a key manifest instead of JSON.stringify(ctx)", async () => {
    const first = promptNode("first", "first", "Produce a document.")
    const decide = decideNode("router", ["go_a", "go_b"])
    await runWorkflowDetailed({
      workflow: workflow([first, decide], [{ id: "e1", source: "first", target: "router" }]),
      sessionId: "root-session",
      input: {},
      directory: "/tmp/session-scope-test",
    })

    const routeText = captured.find((c) => c.text.includes("routing a workflow"))!.text
    expect(routeText).toContain("- first: string") // manifest names the key + shape
    expect(routeText).not.toContain(DOC) // full value is not dumped
  })
})

describe("approval gateway", () => {
  // NOTE: the approval gate is a module-level singleton (registerApprovalGate has no
  // "unregister"), so the no-gate-registered case must run before any test in this file
  // calls registerApprovalGate. Order matters — keep it first in this describe block.
  test("no gate registered → requires_approval is a no-op and the node runs normally", async () => {
    const node = promptNode("gated0", "gated0", "hello0", { requires_approval: true })
    await runWorkflowDetailed({
      workflow: workflow([node], []),
      sessionId: "root-session",
      input: {},
      directory: "/tmp/session-scope-test",
    })
    expect(captured.some((c) => c.text === "hello0")).toBe(true)
  })

  test("requires_approval calls the registered gate with the node's identity", async () => {
    const calls: ApprovalRequest[] = []
    registerApprovalGate(async (req) => {
      calls.push(req)
    })

    const wf = workflow([promptNode("gated1", "gated1", "hello1", { requires_approval: true })], [])
    await runWorkflowDetailed({
      workflow: wf,
      sessionId: "root-session",
      input: {},
      directory: "/tmp/session-scope-test",
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.sessionID).toBe("root-session")
    expect(calls[0]!.nodeID).toBe("gated1")
    expect(calls[0]!.nodeKey).toBe("gated1")
    expect(calls[0]!.nodeLabel).toBe("gated1")
    expect(calls[0]!.nodeType).toBe("prompt")
    expect(calls[0]!.workflowID).toBe(wf.id)
    expect(calls[0]!.workflowRunID).toBeTruthy()
  })

  test("deny (gate throws) fails the node and errors the run", async () => {
    registerApprovalGate(async () => {
      throw new Error("denied by user")
    })

    // The runner catches node-level failures and resolves with a failed status rather than
    // rejecting the promise (matches how every other node error — validation, tool, etc. — is
    // reported), so assert on the resolved result's status, not a rejection.
    const result = await runWorkflowDetailed({
      workflow: workflow([promptNode("gated2", "gated2", "hello2", { requires_approval: true })], []),
      sessionId: "root-session",
      input: {},
      directory: "/tmp/session-scope-test",
    })

    const status = result.outputObject.status as { completed: boolean; error?: string; errorType?: string }
    expect(status.completed).toBe(false)
    expect(status.error).toMatch(/denied approval/)
    expect(status.errorType).toBe("validation") // WorkflowValidationError — non-retryable, terminal
    expect(captured.some((c) => c.text === "hello2")).toBe(false) // node never ran
  })

  test("a node without requires_approval is unaffected even when a gate is registered", async () => {
    let called = false
    registerApprovalGate(async () => {
      called = true
    })

    await runWorkflowDetailed({
      workflow: workflow([promptNode("ungated", "ungated", "hello3")], []),
      sessionId: "root-session",
      input: {},
      directory: "/tmp/session-scope-test",
    })

    expect(called).toBe(false)
  })
})
