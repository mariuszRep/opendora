import { describe, expect, test, mock } from "bun:test"

// ─── Tool/Parameters/ConfigureSession node ctx-write behavior ────────────────
// Covers the Bug B fix: Tool (bash) node stdout is auto-parsed as JSON when it
// looks like one (trimmed text starts with { or [) and stored natively in ctx,
// exactly like Structured/Variable/ForEach already do for their own results.
// Plain-text/scalar stdout is untouched — still stored as the raw string, so an
// existing decide node's exact-string comparison against it never changes
// behavior. Also covers the resultPath clobber this fix incidentally resolves
// (Tool is now excluded from the generic string-write, so resultPath's own
// explicit ctx write is never overwritten back to a string), and Parameters/
// ConfigureSession's equivalent native-write fix.

mock.module("@projectflows/session/session", () => ({
  Session: {
    effectiveDefaultPath: async () => "/tmp/tool-ctx-test",
    setCwd: async () => {},
    setTitle: async () => {},
    setAgentID: async () => {},
    setSystemPrompt: async () => {},
    setPath: async () => {},
    setReadPath: async () => {},
    setWorkflowRun: async () => {},
    updateMessage: async (msg: unknown) => msg,
    updatePart: async () => {},
    get: async () => ({
      agentID: "test-agent",
      title: "New Title",
      cwd: "/tmp",
      path: "/tmp",
      readPath: "/tmp",
    }),
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

const { runWorkflowDetailed, registerToolExecutor } = await import("./runner.ts")

// ─── Node builders ─────────────────────────────────────────────────────────────

function toolNode(nodeId: string, resultPath?: string) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: {
      nodeType: "tool",
      node: {
        label: nodeId,
        action_id: "bash",
        parameters: { command: "irrelevant-in-test", output: nodeId, ...(resultPath ? { resultPath } : {}) },
        key: nodeId,
      },
    },
    position: { x: 0, y: 0 },
  }
}

function parametersNode(nodeId: string, params: Array<{ name: string; required?: boolean }>) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: { nodeType: "parameters", node: { label: nodeId, parameters: {}, key: nodeId }, workflowParameters: params },
    position: { x: 0, y: 0 },
  }
}

function configureSessionNode(nodeId: string, params: Record<string, unknown>) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: { nodeType: "configure_session", node: { label: nodeId, parameters: params, key: nodeId } },
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

// ─── Fake bash tool executor ───────────────────────────────────────────────────

function makeBashExecutor(outputs: string[], metadata?: Record<string, unknown>) {
  let i = 0
  return async (_toolId: string, fixedArgs: Record<string, unknown>) => {
    const output = outputs[i++] ?? ""
    return { output, finalArgs: fixedArgs, ...(metadata ? { metadata } : {}) }
  }
}

describe("Tool node ctx writes", () => {
  test("JSON object stdout becomes a native ctx value navigable by dotted path", async () => {
    registerToolExecutor(makeBashExecutor(['{"decisions":[{"story_id":"s1"}]}\n']))
    const workflow = {
      id: "wf-tool-json-object",
      name: "Tool JSON Object",
      version: "1.0.0",
      nodes: [toolNode("bash_step"), outputNode("out", { decisions: "$ctx.bash_step.decisions" })],
      edges: [edge("bash_step", "out")],
    }
    const result = await runWorkflowDetailed({ workflow: workflow as any, sessionId: "s1", input: {}, directory: "/tmp" })
    expect((result.outputObject as any).status.completed).toBe(true)
    expect((result.outputObject as any).result.decisions).toEqual([{ story_id: "s1" }])
  })

  test("JSON array stdout becomes a native ctx array", async () => {
    registerToolExecutor(makeBashExecutor(["[1,2,3]"]))
    const workflow = {
      id: "wf-tool-json-array",
      name: "Tool JSON Array",
      version: "1.0.0",
      nodes: [toolNode("bash_step"), outputNode("out", { items: "$ctx.bash_step" })],
      edges: [edge("bash_step", "out")],
    }
    const result = await runWorkflowDetailed({ workflow: workflow as any, sessionId: "s2", input: {}, directory: "/tmp" })
    expect((result.outputObject as any).result.items).toEqual([1, 2, 3])
  })

  test("plain-text/scalar stdout stays a raw string, never coerced to a JSON primitive", async () => {
    registerToolExecutor(makeBashExecutor(["42"]))
    const workflow = {
      id: "wf-tool-plain-text",
      name: "Tool Plain Text",
      version: "1.0.0",
      nodes: [toolNode("bash_step"), outputNode("out", { raw: "$ctx.bash_step" })],
      edges: [edge("bash_step", "out")],
    }
    const result = await runWorkflowDetailed({ workflow: workflow as any, sessionId: "s3", input: {}, directory: "/tmp" })
    const raw = (result.outputObject as any).result.raw
    expect(raw).toBe("42")
    expect(typeof raw).toBe("string")
  })

  test("resultPath's native write is no longer clobbered back to a string by the generic write", async () => {
    registerToolExecutor(makeBashExecutor(["human display text"], { answers: [["Story A", "Story B"]] }))
    const workflow = {
      id: "wf-tool-resultpath",
      name: "Tool ResultPath",
      version: "1.0.0",
      nodes: [toolNode("bash_step", "metadata.answers.0"), outputNode("out", { answers: "$ctx.bash_step" })],
      edges: [edge("bash_step", "out")],
    }
    const result = await runWorkflowDetailed({ workflow: workflow as any, sessionId: "s4", input: {}, directory: "/tmp" })
    expect((result.outputObject as any).result.answers).toEqual(["Story A", "Story B"])
  })
})

describe("Parameters node ctx writes", () => {
  test("received params object is stored natively, navigable by dotted path", async () => {
    const workflow = {
      id: "wf-params-native",
      name: "Parameters Native",
      version: "1.0.0",
      nodes: [
        parametersNode("params", [{ name: "foo", required: true }]),
        outputNode("out", { nested: "$ctx.params.foo.nested" }),
      ],
      edges: [edge("params", "out")],
    }
    const result = await runWorkflowDetailed({
      workflow: workflow as any, sessionId: "s5", input: { foo: { nested: 1 } }, directory: "/tmp",
    })
    expect((result.outputObject as any).result.nested).toBe(1)
  })
})

describe("ConfigureSession node ctx writes", () => {
  test("applied/readback object is stored natively, navigable by dotted path", async () => {
    const workflow = {
      id: "wf-configure-session-native",
      name: "ConfigureSession Native",
      version: "1.0.0",
      nodes: [
        configureSessionNode("cfg", { title: "New Title" }),
        outputNode("out", { title: "$ctx.cfg.applied.title" }),
      ],
      edges: [edge("cfg", "out")],
    }
    const result = await runWorkflowDetailed({ workflow: workflow as any, sessionId: "s6", input: {}, directory: "/tmp" })
    expect((result.outputObject as any).result.title).toBe("New Title")
  })
})
