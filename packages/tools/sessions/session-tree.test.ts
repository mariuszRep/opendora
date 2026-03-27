/**
 * Smoke tests for session-tree tool.
 *
 * Run with:
 *   cd /home/ubuntu/projects/opendora
 *   bun packages/tools/sessions/session-tree.test.ts
 */

import { SessionTreeTool } from "./session-tree.ts"

// ---------------------------------------------------------------------------
// Fake session store
// ---------------------------------------------------------------------------
const store: Record<string, any> = {
  ses_root: { id: "ses_root", title: "Root", sessionType: "scope", sessionStatus: "active", agentID: "orchestrator", parentSessionID: null },
  ses_child: { id: "ses_child", title: "Child", sessionType: "worker", sessionStatus: "active", agentID: "worker-a", parentSessionID: "ses_root" },
  ses_grandchild: { id: "ses_grandchild", title: "Grandchild", sessionType: "worker", sessionStatus: "active", agentID: "worker-b", parentSessionID: "ses_child" },
}

const fakeSvc = {
  async get(id: string) { return store[id] ?? null },
  async children(parentId: string) {
    return Object.values(store).filter((s: any) => s.parentSessionID === parentId)
  },
  async messages(_opts: any) { return [] },
}

function makeCtx(sessionID: string) {
  return {
    sessionID,
    messageID: "msg_test",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    extra: { directory: "/tmp", worktree: "/tmp", session: fakeSvc },
    metadata() {},
    async ask() {},
  }
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
console.log("\nsession-tree — smoke tests\n")

const tool = await SessionTreeTool.init()

// 1. Root session: no ancestors, two descendants
await run("root session has depth 0 and includes all descendants", async () => {
  const result = await tool.execute({ session_id: "ses_root", include_stats: false }, makeCtx("ses_root") as any)
  const data = JSON.parse(result.output)
  assert(data.depth === 0, `expected depth 0, got ${data.depth}`)
  assert(data.path.length === 1 && data.path[0] === "ses_root", "path should be [ses_root]")
  assert(data.tree.id === "ses_root", "tree root should be ses_root")
  assert(data.tree.children.length === 1, "root should have 1 child")
  assert(data.tree.children[0].id === "ses_child", "child should be ses_child")
  assert(data.tree.children[0].children[0].id === "ses_grandchild", "grandchild should be present")
})

// 2. Mid-level session: one ancestor, tree rooted at ses_root
await run("child session walks up to root and shows full tree", async () => {
  const result = await tool.execute({ session_id: "ses_child", include_stats: false }, makeCtx("ses_child") as any)
  const data = JSON.parse(result.output)
  assert(data.target === "ses_child", "target should be ses_child")
  assert(data.depth === 1, `expected depth 1, got ${data.depth}`)
  assert(data.path[0] === "ses_root" && data.path[1] === "ses_child", "path should be [ses_root, ses_child]")
  assert(data.tree.id === "ses_root", "tree root should be ses_root (walked up)")
  // the target node should be marked isTarget
  const childNode = data.tree.children[0]
  assert(childNode.id === "ses_child", "child node id")
  assert(childNode.isTarget === true, "child node should be marked isTarget")
})

// 3. Leaf session: depth 2, path of 3
await run("grandchild session has depth 2 and correct path", async () => {
  const result = await tool.execute({ session_id: "ses_grandchild", include_stats: false }, makeCtx("ses_grandchild") as any)
  const data = JSON.parse(result.output)
  assert(data.depth === 2, `expected depth 2, got ${data.depth}`)
  assert(data.path.length === 3, `expected path length 3, got ${data.path.length}`)
  assert(data.path[2] === "ses_grandchild", "last path entry should be ses_grandchild")
})

// 4. Defaults to ctx.sessionID when no session_id param given
await run("defaults to current session when session_id omitted", async () => {
  const result = await tool.execute({ include_stats: false }, makeCtx("ses_child") as any)
  const data = JSON.parse(result.output)
  assert(data.target === "ses_child", `expected target ses_child, got ${data.target}`)
})

// 5. Unknown session returns error JSON
await run("unknown session_id returns error output", async () => {
  const result = await tool.execute({ session_id: "ses_missing", include_stats: false }, makeCtx("ses_missing") as any)
  const data = JSON.parse(result.output)
  assert("error" in data, "should return error for unknown session")
})

// 6. include_stats: stats present with messageCount/toolCallCount
await run("include_stats adds stats object to each node", async () => {
  const result = await tool.execute({ session_id: "ses_root", include_stats: true }, makeCtx("ses_root") as any)
  const data = JSON.parse(result.output)
  assert(data.tree.stats !== undefined, "root node should have stats")
  assert("messageCount" in data.tree.stats, "stats should have messageCount")
  assert("toolCallCount" in data.tree.stats, "stats should have toolCallCount")
})

console.log("\nDone.\n")
