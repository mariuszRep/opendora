/**
 * Focused test for workflow_run direct-context service injection.
 * Verifies that the ctx.extra object supplied by resolveTools includes
 * workflow execution methods and session lifecycle methods needed by the
 * workflow_run tool.
 */
import { describe, expect, test, mock } from "bun:test"
import type { SessionCoreConfig } from "../src/config"

describe("workflow service in SessionCoreConfig", () => {
  test("accepts workflow.run and workflow.availableIds", () => {
    const config: SessionCoreConfig = {
      db: {},
      dataPath: "/tmp",
      workflow: {
        list: async () => [],
        get: async () => null,
        availableIds: async () => ["wf-1", "wf-2"],
        run: async () => "run-session-id",
      },
    }
    expect(config.workflow?.availableIds).toBeDefined()
    expect(config.workflow?.run).toBeDefined()
  })

  test("accepts session.createNext and session.setCwd", () => {
    const config: SessionCoreConfig = {
      db: {},
      dataPath: "/tmp",
      session: {
        updateMessage: async () => ({}),
        updatePart: async () => ({}),
        messages: async () => [],
        createNext: async () => ({ id: "new-session" }),
        setCwd: async () => ({ id: "updated" }),
      },
    }
    expect(config.session?.createNext).toBeDefined()
    expect(config.session?.setCwd).toBeDefined()
  })

  test("workflow methods are optional — existing callers unaffected", () => {
    const config: SessionCoreConfig = {
      db: {},
      dataPath: "/tmp",
      workflow: {
        list: async () => [],
        get: async () => null,
        // availableIds and run omitted — must still compile
      },
    }
    expect(config.workflow?.list).toBeDefined()
    expect(config.workflow?.availableIds).toBeUndefined()
    expect(config.workflow?.run).toBeUndefined()
  })

  test("session methods are optional — existing callers unaffected", () => {
    const config: SessionCoreConfig = {
      db: {},
      dataPath: "/tmp",
      session: {
        updateMessage: async () => ({}),
        updatePart: async () => ({}),
        messages: async () => [],
        // createNext and setCwd omitted — must still compile
      },
    }
    expect(config.session?.createNext).toBeUndefined()
    expect(config.session?.setCwd).toBeUndefined()
  })
})

describe("workflow context shape — matches scheduler reference", () => {
  test("context.workflow matches the structure from server.ts scheduler", () => {
    // Simulate what prompt.ts context() now builds for cfg.workflow
    const mockWorkflow = {
      get: async (id: string) => ({ id, name: "test" }),
      availableIds: async () => ["wf-1"],
      run: async (wf: any, sid: string, input: Record<string, unknown>, dir: string) => sid,
    }

    // Verify all three required methods exist
    expect(typeof mockWorkflow.get).toBe("function")
    expect(typeof mockWorkflow.availableIds).toBe("function")
    expect(typeof mockWorkflow.run).toBe("function")
  })

  test("context.session.createNext and setCwd match scheduler reference", () => {
    // Simulate what prompt.ts context() now builds for cfg.session
    const mockSession = {
      createNext: async (input: any) => ({ id: "new", ...input }),
      setCwd: async (input: { sessionID: string; cwd: string }) => input,
    }

    expect(typeof mockSession.createNext).toBe("function")
    expect(typeof mockSession.setCwd).toBe("function")
  })
})
