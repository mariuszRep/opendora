/**
 * Smoke test for the log tool.
 *
 * Run with:
 *   cd /home/mariu/projects/opendora
 *   bun packages/tools/system/log-lesson.test.ts
 */

import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { LogLessonTool } from "./log-lesson.ts"

// ---------------------------------------------------------------------------
// Minimal fake context — supplies just enough for directory() to work
// ---------------------------------------------------------------------------
function makeCtx(dir: string) {
  return {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    extra: { directory: dir, worktree: dir },
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
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "log-tool-test-"))
// Pre-create .projectflows so findProjectFlowsRoot anchors here even before any log is written
await fs.mkdir(path.join(tmpRoot, ".projectflows"), { recursive: true })

const tool = await LogLessonTool.init()

console.log("\nlog tool — smoke tests\n")

// 1. Creates LOG.md for an agent when it does not exist
await run("creates LOG.md for agent (new file)", async () => {
  const ctx = makeCtx(tmpRoot)
  const result = await tool.execute(
    { target_type: "agent", target_id: "pandora", kind: "error", message: "Failed to find session by label" },
    ctx as any,
  )
  const logPath = path.join(tmpRoot, ".projectflows", "agents", "pandora", "LOG.md")
  const content = await fs.readFile(logPath, "utf8")
  assert(content.includes("# LOG — Agent: pandora"), "missing header")
  assert(content.includes("[ERROR]"), "missing kind label")
  assert(content.includes("Failed to find session by label"), "missing message")
  assert(result.output.includes("LOG updated"), "output should confirm update")
  assert(result.output.includes(".projectflows/agents/pandora/LOG.md"), "output should include relative path")
})

// 2. Appends to existing LOG.md (does not overwrite)
await run("appends to existing LOG.md without overwriting", async () => {
  const ctx = makeCtx(tmpRoot)
  await tool.execute(
    { target_type: "agent", target_id: "pandora", kind: "advisory", message: "Delegation step count consistently high — consider consolidating reads" },
    ctx as any,
  )
  const logPath = path.join(tmpRoot, ".projectflows", "agents", "pandora", "LOG.md")
  const content = await fs.readFile(logPath, "utf8")
  assert(content.includes("Failed to find session by label"), "first entry missing")
  assert(content.includes("Delegation step count"), "second entry missing")
  assert(content.includes("[ERROR]"), "first kind missing")
  assert(content.includes("[ADVISORY]"), "second kind missing")
})

// 3. Creates LOG.md for a skill
await run("creates LOG.md for skill", async () => {
  const ctx = makeCtx(tmpRoot)
  await tool.execute(
    { target_type: "skill", target_id: "experiment", kind: "bug", message: "Baseline session label not searchable", context: "exp-pandora-20260321-1" },
    ctx as any,
  )
  const logPath = path.join(tmpRoot, ".projectflows", "skill", "experiment", "LOG.md")
  const content = await fs.readFile(logPath, "utf8")
  assert(content.includes("# LOG — Skill: experiment"), "missing skill header")
  assert(content.includes("[BUG]"), "missing kind")
  assert(content.includes("exp-pandora-20260321-1"), "context not recorded")
})

// 4. Long message is truncated in the one-line output (not in the file)
await run("long message truncated in output only", async () => {
  const ctx = makeCtx(tmpRoot)
  const long = "x".repeat(120)
  const result = await tool.execute(
    { target_type: "agent", target_id: "pandora", kind: "advisory", message: long },
    ctx as any,
  )
  // Output preview should be truncated to ~80 chars
  const lines = result.output.split("\n")
  assert(lines[1].length <= 83, `preview too long: ${lines[1].length}`)
  // File must contain the full message
  const logPath = path.join(tmpRoot, ".projectflows", "agents", "pandora", "LOG.md")
  const content = await fs.readFile(logPath, "utf8")
  assert(content.includes(long), "full message not written to file")
})

// 5. All kind values write correct labels
await run("all kind values produce correct labels in file", async () => {
  const ctx = makeCtx(tmpRoot)
  const kinds = ["error", "bug", "failed", "advisory"] as const
  for (const kind of kinds) {
    await tool.execute(
      { target_type: "skill", target_id: "retro", kind, message: `test ${kind}` },
      ctx as any,
    )
  }
  const logPath = path.join(tmpRoot, ".projectflows", "skill", "retro", "LOG.md")
  const content = await fs.readFile(logPath, "utf8")
  for (const label of ["[ERROR]", "[BUG]", "[FAILED]", "[ADVISORY]"]) {
    assert(content.includes(label), `missing label ${label}`)
  }
})

// 6. Session directory is a subdirectory — log still goes to project root
await run("log resolves to project root when session dir is a subdirectory", async () => {
  // Simulate an agent whose defaultPaths[0] is .projectflows/skill (agent-owner pattern)
  const subDir = path.join(tmpRoot, ".projectflows", "skill")
  await fs.mkdir(subDir, { recursive: true })
  const ctx = makeCtx(subDir)
  await tool.execute(
    { target_type: "agent", target_id: "agent-owner", kind: "advisory", message: "Rooted from subdir" },
    ctx as any,
  )
  // Must land at tmpRoot/.projectflows/agents/agent-owner/LOG.md — NOT subDir/.projectflows/...
  const correct = path.join(tmpRoot, ".projectflows", "agents", "agent-owner", "LOG.md")
  const wrong = path.join(subDir, ".projectflows", "agents", "agent-owner", "LOG.md")
  const content = await fs.readFile(correct, "utf8")
  assert(content.includes("Rooted from subdir"), "entry missing from correct path")
  let wrongExists = false
  try { await fs.access(wrong); wrongExists = true } catch { /* expected */ }
  assert(!wrongExists, "log was incorrectly written to subDir/.projectflows/")
})

// Cleanup
await fs.rm(tmpRoot, { recursive: true })

console.log("\nDone.\n")
