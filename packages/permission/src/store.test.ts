import { describe, expect, test, beforeEach } from "bun:test"
import { createStore, type AskInput } from "./store.ts"
import { Permission } from "./types.ts"

// ─── In-memory DB + emitter fakes ──────────────────────────────────────────────
// createStore only needs Permission.DB (getRules/saveRule/removeRule) and
// Permission.Emitter (emit) — no real database or bus required to exercise the
// ask/reply state machine.

function createFakeDb(): Permission.DB & { rules: Permission.Rule[] } {
  const rules: Permission.Rule[] = []
  return {
    rules,
    getRules(scope, scope_id) {
      return rules.filter((r) => r.scope === scope && r.scope_id === scope_id)
    },
    saveRule(rule) {
      rules.push(rule)
    },
    removeRule(id) {
      const i = rules.findIndex((r) => r.id === id)
      if (i >= 0) rules.splice(i, 1)
    },
  }
}

function createFakeEmitter(): Permission.Emitter & { events: Array<{ type: string; payload: unknown }> } {
  const events: Array<{ type: string; payload: unknown }> = []
  return {
    events,
    emit(type, payload) {
      events.push({ type, payload })
    },
  }
}

function baseAsk(overrides: Partial<AskInput> = {}): AskInput {
  return {
    session_id: "session-1",
    agent_id: "agent-1",
    resource: "workflow_node",
    access: "*",
    patterns: ["node-a"],
    agent_patterns: [],
    static_rules: [],
    ...overrides,
  }
}

describe("permission store — workflow scope + once/workflow replies", () => {
  let db: ReturnType<typeof createFakeDb>
  let emitter: ReturnType<typeof createFakeEmitter>
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    db = createFakeDb()
    emitter = createFakeEmitter()
    store = createStore(db, emitter)
  })

  test("a persisted workflow-scope rule auto-approves ask without prompting", async () => {
    db.saveRule({
      id: "r1",
      scope: "workflow",
      scope_id: "wf-1",
      resource: "workflow_node",
      access: "*",
      pattern: "node-a",
      action: "allow",
      time_created: Date.now(),
      time_updated: Date.now(),
    })

    await store.ask(baseAsk({ workflow_id: "wf-1" }))

    // Resolved immediately — no permission.asked event, no pending request.
    expect(emitter.events.some((e) => e.type === "permission.asked")).toBe(false)
    expect(store.listPending()).toHaveLength(0)
  })

  test('reply "workflow" persists a workflow-scoped rule and resolves the ask', async () => {
    const askPromise = store.ask(baseAsk({ workflow_id: "wf-1", id: "req-1" }))
    // Let the ask() promise register its pending entry.
    await Promise.resolve()

    store.reply({ request_id: "req-1", reply: "workflow" })
    await expect(askPromise).resolves.toBeUndefined()

    const saved = db.rules.filter((r) => r.scope === "workflow" && r.scope_id === "wf-1")
    expect(saved).toHaveLength(1)
    expect(saved[0]!.pattern).toBe("node-a")
    expect(saved[0]!.action).toBe("allow")

    // A second ask for the same workflow/node now auto-approves.
    emitter.events.length = 0
    await store.ask(baseAsk({ workflow_id: "wf-1", id: "req-2" }))
    expect(emitter.events.some((e) => e.type === "permission.asked")).toBe(false)
  })

  test('reply "once" resolves the ask without persisting any rule', async () => {
    const askPromise = store.ask(baseAsk({ workflow_id: "wf-1", id: "req-1" }))
    await Promise.resolve()

    store.reply({ request_id: "req-1", reply: "once" })
    await expect(askPromise).resolves.toBeUndefined()

    expect(db.rules).toHaveLength(0)

    // A second ask for the same node is NOT auto-approved — it prompts again.
    const askPromise2 = store.ask(baseAsk({ workflow_id: "wf-1", id: "req-2" }))
    await Promise.resolve()
    expect(emitter.events.some((e) => e.type === "permission.asked" && (e.payload as any).id === "req-2")).toBe(true)
    store.reply({ request_id: "req-2", reply: "once" })
    await askPromise2
  })

  test('reply "reject" throws RejectedError and does not persist a rule', async () => {
    const askPromise = store.ask(baseAsk({ workflow_id: "wf-1", id: "req-1" }))
    await Promise.resolve()

    store.reply({ request_id: "req-1", reply: "reject" })
    await expect(askPromise).rejects.toBeInstanceOf(Permission.RejectedError)
    expect(db.rules).toHaveLength(0)
  })

  test('reply "session" still works unaffected by the workflow scope addition', async () => {
    const askPromise = store.ask(baseAsk({ workflow_id: "wf-1", id: "req-1" }))
    await Promise.resolve()

    store.reply({ request_id: "req-1", reply: "session" })
    await expect(askPromise).resolves.toBeUndefined()

    const saved = db.rules.filter((r) => r.scope === "session" && r.scope_id === "session-1")
    expect(saved).toHaveLength(1)
  })
})
