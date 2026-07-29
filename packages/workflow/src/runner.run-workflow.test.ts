import { describe, expect, test, mock, beforeEach } from "bun:test"

// ─── run_workflow child composition contract ──────────────────────────────────
// These tests exercise the real runSubGraph/runWorkflowDetailed node-execution
// loop for parent -> run_workflow -> child (and parent -> for_each -> run_workflow
// -> child) composition, using two real, recursive runWorkflowDetailed calls
// (the fake tool executor below calls the same runner on a nested child
// Workflow) — Session, SessionStatus, and CheckpointStore are mocked because
// they require a live DB/Instance context that isn't needed to prove the
// composition contract itself.
//
// RunWorkflow nodes dispatch to the target's own workflow__<id> tool (see
// runner.ts's actionId computation and workflow-tool-executor.ts's force-
// registration), so the fake executor below is keyed by toolId "workflow__<id>",
// not the generic "workflow_run". It mirrors exactly the fix applied to the real
// per-target tool (packages/tools/workflow-delegation/workflow-target.ts): when
// the child's detailed result reports status.completed === false, it throws
// instead of returning a "successful" tool result — that throw is what lets the
// RunWorkflow node's existing retry/error handling in runner.ts
// (isWorkflowValidationError short-circuit, lastError rethrow) turn a child
// failure into a failed parent node.

mock.module("@projectflows/session/session", () => ({
  Session: {
    effectiveDefaultPath: async () => "/tmp/run-workflow-test",
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
    getLatest: async () => null,
    append: async () => {},
    complete: async () => {},
    markError: async () => {},
  },
  registerActiveRun: () => {},
  deregisterActiveRun: () => {},
}))

const { runWorkflowDetailed, runWorkflow, registerToolExecutor } = await import("./runner.ts")

// ─── Node builders ─────────────────────────────────────────────────────────────

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

function runWorkflowNode(
  nodeId: string,
  parameters: Record<string, unknown>,
  key?: string,
  retry?: { maxAttempts?: number; delaySeconds?: number },
) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: { nodeType: "run_workflow", node: { label: nodeId, action_id: "workflow_run", parameters, ...(key ? { key } : {}), ...(retry ? { retry } : {}) } },
    position: { x: 0, y: 0 },
  }
}

function forEachNode(
  nodeId: string,
  parameters: { items: string; item_variable: string; collect: string; output: string; continue_on_error?: boolean },
  subWorkflow: { nodes: unknown[]; edges: unknown[] },
) {
  return {
    id: nodeId,
    type: "workflow" as const,
    data: { nodeType: "for_each", node: { label: nodeId, parameters }, subWorkflow },
    position: { x: 0, y: 0 },
  }
}

function edge(source: string, target: string) {
  return { id: `${source}->${target}`, source, target }
}

// ─── Fake workflow_run tool — mirrors the real registry tool's fix ────────────

function makeToolExecutor(workflows: Record<string, any>) {
  return async (toolId: string, fixedArgs: Record<string, unknown>, _agentArgs: string[], ctx: { directory?: string }) => {
    if (!toolId.startsWith("workflow__")) throw new Error(`unexpected tool "${toolId}"`)
    const targetId = toolId.slice("workflow__".length)
    const workflow = workflows[targetId]
    if (!workflow) throw new Error(`Workflow "${targetId}" not found`)
    const input = (fixedArgs.input ?? {}) as Record<string, unknown>
    const detailed = await runWorkflowDetailed({
      workflow,
      sessionId: id("child-session"),
      input,
      directory: ctx.directory ?? "/tmp",
    })
    const status = (detailed.outputObject as any).status as { completed: boolean; error?: string; errorType?: string }
    if (!status.completed) {
      const err = new Error(status.error ?? "child workflow failed")
      if (status.errorType === "validation") err.name = "WorkflowValidationError"
      throw err
    }
    return { output: detailed.display, finalArgs: fixedArgs, outputObject: detailed.outputObject }
  }
}

beforeEach(() => {
  nextId = 0
})

describe("run_workflow child composition", () => {
  test("waited child Output result is stored as a native typed value, not a wrapped status/result envelope", async () => {
    const child = {
      id: "child-echo",
      name: "Child Echo",
      version: "1.0.0",
      nodes: [outputNode("out", { value: "$input.payload" })],
      edges: [],
    }
    const parent = {
      id: "parent-echo",
      name: "Parent Echo",
      version: "1.0.0",
      nodes: [
        runWorkflowNode(
          "run",
          { workflowId: "child-echo", input: { payload: { a: 1, b: [1, 2, 3], c: null, d: true } }, wait: "true", output: "workflow_result" },
          "run_key",
        ),
        outputNode("final", { result: "$run_key" }),
      ],
      edges: [edge("run", "final")],
    }
    registerToolExecutor(makeToolExecutor({ "child-echo": child }))

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-echo", input: {}, directory: "/tmp" })
    const outputObject = result.outputObject as any

    expect(outputObject.status.completed).toBe(true)
    // Native types (nested object, array, null, boolean, number) all survive the
    // parent -> child -> parent round trip without being wrapped in {status,result}.
    expect(outputObject.result.result).toEqual({ value: { a: 1, b: [1, 2, 3], c: null, d: true } })
  })

  test("child without an Output node stores a typed completion envelope, not invented result data", async () => {
    const child = {
      id: "child-noop",
      name: "Child Noop",
      version: "1.0.0",
      nodes: [parametersNode("p", [])],
      edges: [],
    }
    const parent = {
      id: "parent-noop",
      name: "Parent Noop",
      version: "1.0.0",
      nodes: [
        runWorkflowNode("run", { workflowId: "child-noop", input: {}, wait: "true", output: "workflow_result" }, "run_key"),
        outputNode("final", { result: "$run_key" }),
      ],
      edges: [edge("run", "final")],
    }
    registerToolExecutor(makeToolExecutor({ "child-noop": child }))

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-noop", input: {}, directory: "/tmp" })
    const stored = (result.outputObject as any).result.result

    expect(stored.status.completed).toBe(true)
    expect(stored).not.toHaveProperty("result")
  })

  test("a failing child fails the parent's run_workflow node and blocks downstream nodes", async () => {
    const child = {
      id: "child-fail",
      name: "Child Fail",
      version: "1.0.0",
      nodes: [parametersNode("p", [{ name: "must_have", required: true }])],
      edges: [],
    }
    const parent = {
      id: "parent-fail",
      name: "Parent Fail",
      version: "1.0.0",
      nodes: [
        runWorkflowNode("run", { workflowId: "child-fail", input: {}, wait: "true", output: "workflow_result" }, "run_key"),
        outputNode("final", { reached: "true" }),
      ],
      edges: [edge("run", "final")],
    }
    registerToolExecutor(makeToolExecutor({ "child-fail": child }))

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-fail", input: {}, directory: "/tmp" })
    const outputObject = result.outputObject as any

    expect(outputObject.status.completed).toBe(false)
    expect(outputObject.status.error).toContain("must_have")
    // "final" never ran — no invented/leftover output from a node the graph never reached.
    expect(outputObject.result).toBeUndefined()
    const steps = outputObject.status.steps as Array<{ label: string; passed: boolean }>
    expect(steps.find((s) => s.label === "run")?.passed).toBe(false)
    expect(steps.find((s) => s.label === "final")).toBeUndefined()
  })

  test("a flat field alongside explicit input fails deterministically and names the stray key", async () => {
    const parent = {
      id: "parent-collision",
      name: "Parent Collision",
      version: "1.0.0",
      nodes: [runWorkflowNode("run", { workflowId: "irrelevant", input: { foo: "bar" }, foo: "baz", wait: "true" })],
      edges: [],
    }
    registerToolExecutor(makeToolExecutor({}))

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-collision", input: {}, directory: "/tmp" })
    const outputObject = result.outputObject as any

    expect(outputObject.status.completed).toBe(false)
    expect(outputObject.status.error).toContain('"foo"')
    expect(outputObject.status.error).toContain("input")
  })

  test.each([
    ["blank JSON string", ""],
    ["malformed JSON string", "{not json"],
    ["array-shaped JSON string", "[1,2,3]"],
    ["primitive-shaped JSON string", '"just a string"'],
  ])("explicit input rejects %s before invoking the child", async (_label, badInput) => {
    const parent = {
      id: "parent-badinput",
      name: "Parent Bad Input",
      version: "1.0.0",
      nodes: [runWorkflowNode("run", { workflowId: "irrelevant", input: badInput, wait: "true" })],
      edges: [],
    }
    registerToolExecutor(makeToolExecutor({}))

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-badinput", input: {}, directory: "/tmp" })
    expect((result.outputObject as any).status.completed).toBe(false)
  })

  test("explicit input as a valid JSON string is parsed and forwarded to the child", async () => {
    const child = {
      id: "child-echo-json",
      name: "Child Echo JSON",
      version: "1.0.0",
      nodes: [outputNode("out", { foo: "$input.foo" })],
      edges: [],
    }
    const parent = {
      id: "parent-json-input",
      name: "Parent JSON Input",
      version: "1.0.0",
      nodes: [
        runWorkflowNode("run", { workflowId: "child-echo-json", input: '{"foo":"bar"}', wait: "true", output: "workflow_result" }, "run_key"),
        outputNode("final", { result: "$run_key" }),
      ],
      edges: [edge("run", "final")],
    }
    registerToolExecutor(makeToolExecutor({ "child-echo-json": child }))

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-json-input", input: {}, directory: "/tmp" })
    const outputObject = result.outputObject as any

    expect(outputObject.status.completed).toBe(true)
    expect(outputObject.result.result).toEqual({ foo: "bar" })
  })

  test("legacy flat individual fields with no explicit input key are rejected, not silently merged", async () => {
    const parent = {
      id: "parent-legacy",
      name: "Parent Legacy",
      version: "1.0.0",
      nodes: [runWorkflowNode("run", { workflowId: "irrelevant", foo: "bar", baz: 42, wait: "true", output: "workflow_result" }, "run_key")],
      edges: [],
    }
    registerToolExecutor(makeToolExecutor({}))

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-legacy", input: {}, directory: "/tmp" })
    const outputObject = result.outputObject as any

    expect(outputObject.status.completed).toBe(false)
    expect(outputObject.status.error).toContain('"foo"')
    expect(outputObject.status.error).toContain('"baz"')
    expect(outputObject.status.error).toContain("input")
  })

  test("a non-validation (operational) child failure is retried per the node's own retry policy", async () => {
    const workflows = {
      "child-flaky": { id: "child-flaky", name: "Child Flaky", version: "1.0.0", nodes: [outputNode("out", { ok: "true" })], edges: [] },
    }
    let callCount = 0
    const baseExecutor = makeToolExecutor(workflows)
    registerToolExecutor(async (...args: Parameters<typeof baseExecutor>) => {
      callCount++
      if (callCount < 3) throw new Error(`transient failure #${callCount}`)
      return baseExecutor(...args)
    })
    const parent = {
      id: "parent-retry",
      name: "Parent Retry",
      version: "1.0.0",
      nodes: [runWorkflowNode("run", { workflowId: "child-flaky", input: {}, wait: "true", output: "workflow_result" }, "run_key", { maxAttempts: 3, delaySeconds: 0 })],
      edges: [],
    }

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-retry", input: {}, directory: "/tmp" })

    expect((result.outputObject as any).status.completed).toBe(true)
    expect(callCount).toBe(3)
  })

  test("legacy runWorkflow() still resolves to a string, never throws, even when the workflow fails", async () => {
    const parent = {
      id: "parent-legacy-api",
      name: "Parent Legacy API",
      version: "1.0.0",
      nodes: [parametersNode("p", [{ name: "must_have", required: true }])],
      edges: [],
    }
    registerToolExecutor(makeToolExecutor({}))

    const display = await runWorkflow({ workflow: parent as any, sessionId: "s-legacy-api", input: {}, directory: "/tmp" })

    expect(typeof display).toBe("string")
    expect(display).toContain("must_have")
  })

  test("for_each collects isolated, ordered, natively typed run_workflow results per iteration", async () => {
    const childEchoN = {
      id: "child-echo-n",
      name: "Child Echo N",
      version: "1.0.0",
      nodes: [outputNode("out", { n: "$input.n" })],
      edges: [],
    }
    const parent = {
      id: "parent-foreach",
      name: "Parent ForEach",
      version: "1.0.0",
      nodes: [
        forEachNode(
          "loop",
          { items: "$input.items", item_variable: "n", collect: "$ctx.child_result", output: "curated" },
          { nodes: [runWorkflowNode("child_run", { workflowId: "child-echo-n", input: { n: "$n" }, wait: "true", output: "child_result" }, "child_result")], edges: [] },
        ),
        outputNode("final", { results: "$curated" }),
      ],
      edges: [edge("loop", "final")],
    }
    registerToolExecutor(makeToolExecutor({ "child-echo-n": childEchoN }))

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-foreach", input: { items: [1, 2, 3] }, directory: "/tmp" })
    const outputObject = result.outputObject as any

    expect(outputObject.status.completed).toBe(true)
    expect(outputObject.result.results).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  test("a for_each iteration whose child fails with a deterministic validation error is not retried and fails the parent", async () => {
    const childRequiresParam = {
      id: "child-requires-n",
      name: "Child Requires N",
      version: "1.0.0",
      nodes: [parametersNode("p", [{ name: "n", required: true }]), outputNode("out", { n: "$input.n" })],
      edges: [edge("p", "out")],
    }
    let invocationCount = 0
    const countingExecutor = makeToolExecutor({ "child-requires-n": childRequiresParam })
    const parent = {
      id: "parent-foreach-fail",
      name: "Parent ForEach Fail",
      version: "1.0.0",
      nodes: [
        forEachNode(
          "loop",
          { items: "$input.items", item_variable: "n", collect: "$ctx.child_result", output: "curated" },
          // "n" is deliberately omitted from the child input so the child's own
          // Parameters node throws a deterministic WorkflowValidationError on every attempt.
          { nodes: [runWorkflowNode("child_run", { workflowId: "child-requires-n", input: {}, wait: "true", output: "child_result" }, "child_result")], edges: [] },
        ),
      ],
      edges: [],
    }
    registerToolExecutor(async (...args: Parameters<typeof countingExecutor>) => {
      invocationCount++
      return countingExecutor(...args)
    })

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-foreach-fail", input: { items: [1, 2, 3] }, directory: "/tmp" })
    const outputObject = result.outputObject as any

    expect(outputObject.status.completed).toBe(false)
    // Only the first (failing) iteration's child ran — no retries, and the loop
    // stopped instead of continuing to remaining items.
    expect(invocationCount).toBe(1)
  })

  test("for_each can continue after exhausted iteration failures when explicitly configured", async () => {
    const child = {
      id: "child-fails-one",
      name: "Child Fails One",
      version: "1.0.0",
      nodes: [parametersNode("p", [{ name: "n", required: true }]), outputNode("out", { n: "$input.n" })],
      edges: [edge("p", "out")],
    }
    const parent = {
      id: "parent-foreach-continue",
      name: "Parent ForEach Continue",
      version: "1.0.0",
      nodes: [
        forEachNode(
          "loop",
          { items: "$input.items", item_variable: "n", collect: "$ctx.child_result", output: "curated", continue_on_error: true },
          {
            nodes: [runWorkflowNode("child_run", {
              workflowId: "child-fails-one",
              input: { n: "$n" },
              wait: "true",
              output: "child_result",
            }, "child_result")],
            edges: [],
          },
        ),
        outputNode("final", { results: "$curated" }),
      ],
      edges: [edge("loop", "final")],
    }
    const executor = makeToolExecutor({ "child-fails-one": child })
    registerToolExecutor(async (...args: Parameters<typeof executor>) => {
      if ((args[1].input as { n: number }).n === 2) {
        const error = new Error("invalid item")
        error.name = "WorkflowValidationError"
        throw error
      }
      return executor(...args)
    })

    const result = await runWorkflowDetailed({ workflow: parent as any, sessionId: "s-foreach-continue", input: { items: [1, 2, 3] }, directory: "/tmp" })
    const output = result.outputObject as any

    expect(output.status.completed).toBe(true)
    expect(output.result.results).toEqual([
      { n: 1 },
      { status: "error", item: 2, error: "invalid item", errorType: "validation" },
      { n: 3 },
    ])
  })
})
