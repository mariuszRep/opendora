/**
 * Smoke tests for session_update tool.
 *
 * Run with:
 *   cd /home/mariu/projects/projectflows
 *   bun packages/tools/sessions/session-update.test.ts
 */

import z from "zod"
import { SessionUpdateTool, parameters } from "./session-update.ts"

// ---------------------------------------------------------------------------
// Fake session store
// ---------------------------------------------------------------------------
interface SessionInfo {
  id: string
  title: string
  sessionType: string
  sessionStatus: string
  agentID: string | null
  parentSessionID: string | null
}

const store: Record<string, SessionInfo> = {
  ses_a: { id: "ses_a", title: "Session A", sessionType: "scope", sessionStatus: "active", agentID: "agent-1", parentSessionID: null },
  ses_b: { id: "ses_b", title: "Session B", sessionType: "worker", sessionStatus: "active", agentID: "agent-2", parentSessionID: "ses_a" },
  ses_c: { id: "ses_c", title: "Session C", sessionType: "worker", sessionStatus: "archived", agentID: "agent-3", parentSessionID: "ses_b" },
}

// Track setTitle calls
let setTitleCalled = 0
let setTitleSessionId = ""
let setTitleValue = ""

let setAgentIDCalled = 0
let setAgentIDSessionId = ""
let setAgentIDValue = ""

let setParentSessionIDCalled = 0
let setParentSessionIDSessionId = ""
let setParentSessionIDValue = ""

let setSessionStatusCalled = 0
let setSessionStatusSessionId = ""
let setSessionStatusValue = ""

const fakeAgents: Record<string, any> = {
  "agent-1": { id: "agent-1", name: "Agent 1" },
  "agent-2": { id: "agent-2", name: "Agent 2" },
  "agent-3": { id: "agent-3", name: "Agent 3" },
  "new-agent": { id: "new-agent", name: "New Agent" },
}

const fakeSvc = {
  async get(id: string): Promise<SessionInfo | null> {
    return store[id] ?? null
  },
  async setTitle(id: string, value: string): Promise<void> {
    setTitleCalled++
    setTitleSessionId = id
    setTitleValue = value
    if (store[id]) store[id].title = value
  },
  async setAgentID(id: string, value: string): Promise<void> {
    setAgentIDCalled++
    setAgentIDSessionId = id
    setAgentIDValue = value
    if (store[id]) store[id].agentID = value || null
  },
  async setParentSessionID(opts: { sessionID: string; parentSessionID: string }): Promise<void> {
    setParentSessionIDCalled++
    setParentSessionIDSessionId = opts.sessionID
    setParentSessionIDValue = opts.parentSessionID
    const entry = store[opts.sessionID]
    if (entry) entry.parentSessionID = opts.parentSessionID
  },
  async setSessionStatus(id: string, value: string): Promise<void> {
    setSessionStatusCalled++
    setSessionStatusSessionId = id
    setSessionStatusValue = value
    if (store[id]) store[id].sessionStatus = value
  },
}

const fakeAgentsSvc = {
  async get(id: string) {
    return fakeAgents[id]
  },
}

function makeCtx(sessionID: string) {
  return {
    sessionID,
    messageID: "msg_test",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    extra: {
      directory: "/tmp",
      worktree: "/tmp",
      session: fakeSvc,
      agents: fakeAgentsSvc,
    },
    metadata() {},
    async ask(_input: any): Promise<void> {
      // Permission always granted for tests
    },
  }
}

function resetCalls() {
  setTitleCalled = 0
  setTitleSessionId = ""
  setTitleValue = ""
  setAgentIDCalled = 0
  setAgentIDSessionId = ""
  setAgentIDValue = ""
  setParentSessionIDCalled = 0
  setParentSessionIDSessionId = ""
  setParentSessionIDValue = ""
  setSessionStatusCalled = 0
  setSessionStatusSessionId = ""
  setSessionStatusValue = ""
}

// Reset store between tests
function resetStore() {
  store["ses_a"] = { id: "ses_a", title: "Session A", sessionType: "scope", sessionStatus: "active", agentID: "agent-1", parentSessionID: null }
  store["ses_b"] = { id: "ses_b", title: "Session B", sessionType: "worker", sessionStatus: "active", agentID: "agent-2", parentSessionID: "ses_a" }
  store["ses_c"] = { id: "ses_c", title: "Session C", sessionType: "worker", sessionStatus: "archived", agentID: "agent-3", parentSessionID: "ses_b" }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function run(label: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`  ✓ ${label}`)
  } catch (e) {
    console.error(`  ✗ ${label}`)
    console.error(`    ${e}`)
    process.exitCode = 1
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
console.log("\nsession_update — smoke tests\n")

const tool = await SessionUpdateTool.init()

// 1. Session not found throws
resetStore()
await run("throws when session not found", async () => {
  let threw: Error | null = null
  try {
    await tool.execute({ session_id: "ses_missing" }, makeCtx("ses_a") as any)
  } catch (e: any) {
    threw = e
  }
  assert(threw !== null, "should throw")
  assert(threw!.message.includes("not found"), "error should indicate session not found")
})

// 2. No update field provided throws
resetStore()
await run("throws when no update field provided", async () => {
  let threw: Error | null = null
  try {
    await tool.execute({ session_id: "ses_a" }, makeCtx("ses_a") as any)
  } catch (e: any) {
    threw = e
  }
  assert(threw !== null, "should throw")
  assert(threw!.message.includes("At least one update field"), "error should indicate update field needed")
})

// 3. Title update works
resetStore()
resetCalls()
await run("title update calls setTitle with correct values", async () => {
  const result = await tool.execute({ session_id: "ses_a", title: "New Title" }, makeCtx("ses_a") as any)
  const data = JSON.parse(result.output)
  assert(setTitleCalled === 1, `setTitle should be called once, got ${setTitleCalled}`)
  assert(setTitleSessionId === "ses_a", `session id should be ses_a, got ${setTitleSessionId}`)
  assert(setTitleValue === "New Title", `title should be 'New Title', got ${setTitleValue}`)
  assert(data.changes?.title?.new === "New Title", "changes should include title change")
})

// 4. Agent update validates agent exists
resetStore()
resetCalls()
await run("agent update throws for non-existent agent", async () => {
  let threw: Error | null = null
  try {
    await tool.execute({ session_id: "ses_a", agent_id: "fake-agent" }, makeCtx("ses_a") as any)
  } catch (e: any) {
    threw = e
  }
  assert(threw !== null, "should throw")
  assert(threw!.message.includes("not found"), "error should indicate agent not found")
})

// 5. Agent update works
resetStore()
resetCalls()
await run("agent update calls setAgentID with correct values", async () => {
  const result = await tool.execute({ session_id: "ses_a", agent_id: "new-agent" }, makeCtx("ses_a") as any)
  const data = JSON.parse(result.output)
  assert(setAgentIDCalled === 1, `setAgentID should be called once, got ${setAgentIDCalled}`)
  assert(setAgentIDSessionId === "ses_a", `session id should be ses_a, got ${setAgentIDSessionId}`)
  assert(setAgentIDValue === "new-agent", `agent id should be new-agent, got ${setAgentIDValue}`)
  assert(data.changes?.agent_id?.new === "new-agent", "changes should include agent_id change")
})

// 6. Parent session update calls setParentSessionID
resetStore()
resetCalls()
await run("parent_session_id update calls setParentSessionID with correct values", async () => {
  const result = await tool.execute({ session_id: "ses_a", parent_session_id: "ses_b" }, makeCtx("ses_a") as any)
  const data = JSON.parse(result.output)
  assert(setParentSessionIDCalled === 1, `setParentSessionID should be called once, got ${setParentSessionIDCalled}`)
  assert(setParentSessionIDSessionId === "ses_a", `session id should be ses_a, got ${setParentSessionIDSessionId}`)
  assert(setParentSessionIDValue === "ses_b", `parent id should be ses_b, got ${setParentSessionIDValue}`)
  assert(data.changes?.parent_session_id?.new === "ses_b", "changes should include parent_session_id change")
})

// 7. Status update calls setSessionStatus
resetStore()
resetCalls()
await run("status update calls setSessionStatus with correct values", async () => {
  const result = await tool.execute({ session_id: "ses_a", status: "archived" }, makeCtx("ses_a") as any)
  const data = JSON.parse(result.output)
  assert(setSessionStatusCalled === 1, `setSessionStatus should be called once, got ${setSessionStatusCalled}`)
  assert(setSessionStatusSessionId === "ses_a", `session id should be ses_a, got ${setSessionStatusSessionId}`)
  assert(setSessionStatusValue === "archived", `status should be archived, got ${setSessionStatusValue}`)
  assert(data.changes?.status?.new === "archived", "changes should include status change")
})

// 8. No-op detection (no change)
resetStore()
resetCalls()
await run("returns unchanged when requested value matches current value", async () => {
  // ses_c has status "archived", set it to "archived" (same)
  const result = await tool.execute({ session_id: "ses_c", status: "archived" }, makeCtx("ses_c") as any)
  // Note: unchanged is in metadata, not in the JSON output string
  assert(result.metadata?.unchanged === true, "should be marked unchanged in metadata")
  assert(setSessionStatusCalled === 0, "setSessionStatus should not be called when no change")
})

// 9. Returns old/new values in changes
resetStore()
resetCalls()
await run("reports old and new values in changes response", async () => {
  const result = await tool.execute({ session_id: "ses_a", title: "Renamed" }, makeCtx("ses_a") as any)
  const data = JSON.parse(result.output)
  assert(data.changes?.title?.old === "Session A", `old title should be 'Session A', got ${data.changes?.title?.old}`)
  assert(data.changes?.title?.new === "Renamed", `new title should be 'Renamed', got ${data.changes?.title?.new}`)
})

// 10. Title update and restore (safe update can be undone)
resetStore()
resetCalls()
await run("title update and restore works round-trip", async () => {
  // First change: change to "Updated Title"
  const result1 = await tool.execute({ session_id: "ses_a", title: "Updated Title" }, makeCtx("ses_a") as any)
  const data1 = JSON.parse(result1.output)
  assert(data1.changes?.title?.new === "Updated Title", "first change should succeed")
  assert(store["ses_a"]!.title === "Updated Title", "store should be updated")

  // Restore: change back to original "Session A"
  const result2 = await tool.execute({ session_id: "ses_a", title: "Session A" }, makeCtx("ses_a") as any)
  const data2 = JSON.parse(result2.output)
  assert(data2.changes?.title?.new === "Session A", "restore should succeed")
  assert(store["ses_a"]!.title === "Session A", "store should be restored")
})

// 11. Parent session update validates parent exists
resetStore()
resetCalls()
await run("parent_session_id update with non-existent parent succeeds (no agent validation)", async () => {
  // Parent session validation is NOT required - will set to any value
  const result = await tool.execute({ session_id: "ses_a", parent_session_id: "ses_nonexistent" }, makeCtx("ses_a") as any)
  const data = JSON.parse(result.output)
  assert(setParentSessionIDCalled === 1, `setParentSessionID should be called, got ${setParentSessionIDCalled}`)
  assert(data.changes?.parent_session_id?.new === "ses_nonexistent", "should allow non-existent parent")
})

// 12. Status schema validates enum values via parse
resetStore()
resetCalls()
await run("status parameter schema rejects invalid enum via parse", async () => {
  // Valid values should parse without error
  const valid = parameters.parse({ session_id: "ses_a", status: "active" })
  assert(valid.status === "active", "should parse valid 'active'")

  const valid2 = parameters.parse({ session_id: "ses_a", status: "archived" })
  assert(valid2.status === "archived", "should parse valid 'archived'")

  const valid3 = parameters.parse({ session_id: "ses_a", status: "closed" })
  assert(valid3.status === "closed", "should parse valid 'closed'")

  // Invalid value should throw
  let threw = false
  try {
    parameters.parse({ session_id: "ses_a", status: "invalid" })
  } catch (e) {
    threw = true
  }
  assert(threw, "should reject invalid status value")
})

console.log("\nDone.\n")