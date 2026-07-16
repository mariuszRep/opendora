import { describe, expect, test, mock, afterAll } from "bun:test"
import z from "zod"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "@projectflows/runtime/instance"
import { Identifier } from "@projectflows/util/id"
import { ToolRegistry } from "@projectflows/server/tool-registry"
import { Question } from "@projectflows/runtime/question"

// createWorkflowToolExecutor drives dynamic-argument tool calls through
// SessionPrompt.promptWithExtraTools (a real, forced single-tool agent turn).
// That requires a live model in production; here we mock promptWithExtraTools
// to directly invoke the injected tool's execute() with attacker-controlled
// (i.e. test-controlled) "agent-provided" args, exactly as the AI SDK would
// when the model calls the tool — this exercises the real merge/validate/
// retry logic in workflow-tool-executor.ts without needing a live model.
//
// The tool registry itself is NOT module-mocked (mock.module() replaces a
// module for the whole test process, not just this file, and doing that to
// @projectflows/server/tool-registry previously broke test/tool/registry.test.ts
// by leaking an incomplete stub into it). Instead, register a real fake tool
// via ToolRegistry.register() and clean up with ToolRegistry.reset() so other
// test files see the real, fully-populated registry again.
//
// mock.module() is still used for SessionPrompt (no other test file in this
// package depends on it at import time), restored in afterAll for safety.
const realSessionPrompt = await import("@projectflows/session/prompt")

let fakeToolDef: any
const promptWithExtraToolsMock = mock(async (_input: any, extraTools: Record<string, any>) => {
  const [toolId, tool] = Object.entries(extraTools)[0]!
  await tool.execute(fakeToolDef.__nextAgentArgs, { toolCallId: "test-call", messages: [], abortSignal: new AbortController().signal })
  return { info: {}, parts: [] } as any
})

mock.module("@projectflows/session/prompt", () => ({
  SessionPrompt: {
    promptWithExtraTools: promptWithExtraToolsMock,
    markExtraToolsDone: () => {},
    prompt: async () => ({ info: {}, parts: [] }) as any,
    resolvePromptParts: async (t: string) => [{ type: "text", text: t }],
  },
}))

afterAll(() => {
  mock.module("@projectflows/session/prompt", () => realSessionPrompt)
  ToolRegistry.reset()
})

// ToolRegistry.init() resets its internal tool list the first time it runs for
// a given Instance key, which would wipe a fake tool registered beforehand.
// Call init() first, then register — matches how createWorkflowToolExecutor's
// own internal init() call (a no-op once already initialized for this key)
// will find the fake tool still present.
async function registerFakeTool() {
  await ToolRegistry.init()
  ToolRegistry.register({
    id: "fake-tool",
    init: async () => fakeToolDef,
  } as any)
}

const { createWorkflowToolExecutor } = await import("../../src/workflow-tool-executor")

function makeFakeTool(schema: z.ZodType, executeImpl: (args: any) => Promise<any>) {
  return {
    description: "A fake tool for testing",
    parameters: schema,
    execute: executeImpl,
    __nextAgentArgs: {} as any,
  }
}

describe("createWorkflowToolExecutor", () => {
  test("executes directly with fixed args when there are no agentArgs (no model call)", async () => {
    fakeToolDef = makeFakeTool(z.object({ name: z.string() }), async (args: any) => ({
      title: "done",
      output: `hello ${args.name}`,
      metadata: { ok: true },
      outputObject: { name: args.name },
    }))

    await using tmp = await tmpdir({ init: async () => {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await registerFakeTool()
        const executor = createWorkflowToolExecutor()
        const result = await executor("fake-tool", { name: "world" }, [], { sessionID: Identifier.ascending("session") })
        expect(result.output).toBe("hello world")
        expect(result.finalArgs).toEqual({ name: "world" })
        expect(result.outputObject).toEqual({ name: "world" })
        expect(promptWithExtraToolsMock).not.toHaveBeenCalled()
      },
    })
  })

  test("agentArgs path: fixed args win over agent-generated values, and outputObject propagates", async () => {
    fakeToolDef = makeFakeTool(z.object({ name: z.string(), source: z.string() }), async (args: any) => ({
      title: "done",
      output: `hello ${args.name} from ${args.source}`,
      metadata: {},
      outputObject: { name: args.name, source: args.source },
    }))
    fakeToolDef.__nextAgentArgs = { name: "agent-guess", source: "agent" }

    await using tmp = await tmpdir({ init: async () => {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await registerFakeTool()
        const executor = createWorkflowToolExecutor()
        // "source" is fixed/configured — must win over whatever the agent supplies.
        const result = await executor("fake-tool", { source: "fixed" }, ["name"], { sessionID: Identifier.ascending("session") })
        expect(result.finalArgs).toEqual({ name: "agent-guess", source: "fixed" })
        expect(result.output).toBe("hello agent-guess from fixed")
        expect(result.outputObject).toEqual({ name: "agent-guess", source: "fixed" })
      },
    })
  })

  test("bounded to two total fill attempts: invalid args on both tries throw with actionable feedback, tool never executes", async () => {
    let executeCalls = 0
    fakeToolDef = makeFakeTool(z.object({ name: z.string().min(1) }), async (args: any) => {
      executeCalls++
      return { title: "done", output: "ok", metadata: {} }
    })

    let attempt = 0
    promptWithExtraToolsMock.mockImplementation(async (_input: any, extraTools: Record<string, any>) => {
      const [, tool] = Object.entries(extraTools)[0]!
      // Simulate the model retrying within the same forced turn: two invalid calls.
      for (let i = 0; i < 2; i++) {
        attempt++
        try {
          await tool.execute({ name: "" }, { toolCallId: `test-call-${attempt}`, messages: [], abortSignal: new AbortController().signal })
        } catch {
          // swallowed here — the executor's own bounded-attempt logic is what we're testing
        }
      }
      return { info: {}, parts: [] } as any
    })

    await using tmp = await tmpdir({ init: async () => {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await registerFakeTool()
        const executor = createWorkflowToolExecutor()
        await expect(executor("fake-tool", {}, ["name"], { sessionID: Identifier.ascending("session") })).rejects.toThrow(/failed schema validation/)
        expect(executeCalls).toBe(0)
      },
    })

    promptWithExtraToolsMock.mockImplementation(async (_input: any, extraTools: Record<string, any>) => {
      const [toolId, tool] = Object.entries(extraTools)[0]!
      await tool.execute(fakeToolDef.__nextAgentArgs, { toolCallId: "test-call", messages: [], abortSignal: new AbortController().signal })
      return { info: {}, parts: [] } as any
    })
  })

  // AC2 evidence: the real question-tool shape is a nested array of arrays
  // (questions[].options[].{label,description}) — the exact shape the
  // original production incident (merged news-event options) went through.
  // The literal registered "question" tool isn't used here because built-in
  // tool groups (question/websearch/bash) are installed via a separate
  // cross-repo bootstrap (projectflows-website's `bun run tools:install` into
  // ~/.projectflows/tools) that this test sandbox's isolated fake $HOME never
  // runs — a distinct, not-yet-fixed gap tracked in this goal's Attempts.
  // This test instead uses the real Question.Info Zod schema from
  // packages/runtime/src/question.ts, proving the generic fill/merge/validate
  // mechanism handles that exact nested shape correctly without any
  // question-specific code in the executor.
  test("question-shaped schema: nested questions/options array is generated, merged, and validated intact", async () => {
    fakeToolDef = makeFakeTool(
      z.object({ questions: z.array(Question.Info) }),
      async (args: any) => ({
        title: `${args.questions.length} question(s)`,
        output: args.questions.map((q: any) => q.question).join("\n"),
        metadata: {},
        outputObject: args.questions,
      }),
    )
    fakeToolDef.__nextAgentArgs = {
      questions: [
        {
          question: "Which stories should be published?",
          header: "Select",
          multiple: true,
          options: [
            { label: "OpenAI launches GPT-5", description: "Source: openai.com" },
            { label: "Anthropic raises $10B", description: "Source: anthropic.com" },
          ],
        },
      ],
    }

    await using tmp = await tmpdir({ init: async () => {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await registerFakeTool()
        const executor = createWorkflowToolExecutor()
        const result = await executor("fake-tool", {}, ["questions"], { sessionID: Identifier.ascending("session") })
        const finalQuestions = result.finalArgs.questions as any[]
        expect(finalQuestions).toHaveLength(1)
        expect(finalQuestions[0].options).toHaveLength(2)
        expect(finalQuestions[0].options[0]).toEqual({ label: "OpenAI launches GPT-5", description: "Source: openai.com" })
        // Nested arrays/objects must survive as real types, not get stringified.
        expect(Array.isArray(finalQuestions[0].options)).toBe(true)
        expect(result.outputObject).toEqual(fakeToolDef.__nextAgentArgs.questions)
      },
    })

    promptWithExtraToolsMock.mockImplementation(async (_input: any, extraTools: Record<string, any>) => {
      const [toolId, tool] = Object.entries(extraTools)[0]!
      await tool.execute(fakeToolDef.__nextAgentArgs, { toolCallId: "test-call", messages: [], abortSignal: new AbortController().signal })
      return { info: {}, parts: [] } as any
    })
  })
})
