/**
 * End-to-end smoke test for the Claude and Codex importers.
 * Creates an in-memory sqlite, runs every migration, seeds a project row,
 * feeds synthetic vendor fixtures through each importer, and asserts that
 * messages and parts come back out with vendor origin preserved.
 */
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "fs"
import path from "path"
import os from "os"

import { importClaudeSession } from "@projectflows/session/import"
import { importCodexSession } from "@projectflows/session/import"
import { configure } from "@projectflows/session/config"
import { Session } from "@projectflows/session/session"
import * as schema from "@projectflows/session/sql"

const sqlite = new Database(":memory:")
sqlite.run("PRAGMA foreign_keys = ON")

// Apply every Projectflows migration to the in-memory db.
const migDir = path.resolve(import.meta.dir, "../../storage/migration")
for (const name of readdirSync(migDir).filter((n) => n.match(/^[0-9]/)).sort()) {
  const raw = readFileSync(path.join(migDir, name, "migration.sql"), "utf-8")
  for (const stmt of raw.split(/;\s*\n/)) {
    const clean = stmt.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim()
    if (clean) sqlite.run(clean)
  }
}

const db = drizzle({ client: sqlite, schema })
configure({ db: db as any, dataPath: "/tmp" })

// Seed a project row (FK target for session.project_id).
sqlite.run(
  `INSERT INTO project (id, worktree, time_created, time_updated, sandboxes) VALUES ('prj_test', '/tmp/test', 0, 0, '[]')`,
)

// ─── Claude fixture ──────────────────────────────────────────────────────────

const claudeFixture = [
  {
    type: "user",
    uuid: "u1",
    sessionId: "claude-abc",
    cwd: "/home/me/proj",
    timestamp: "2026-04-24T10:00:00.000Z",
    message: { role: "user", content: [{ type: "text", text: "Hello" }] },
  },
  {
    type: "assistant",
    uuid: "a1",
    parentUuid: "u1",
    timestamp: "2026-04-24T10:00:05.000Z",
    message: {
      role: "assistant",
      model: "claude-sonnet-4.5",
      content: [
        { type: "thinking", thinking: "Let me check the file", signature: "sig123" },
        { type: "text", text: "I'll read it for you." },
        { type: "tool_use", id: "toolu_01", name: "Read", input: { path: "/tmp/x" } },
      ],
    },
  },
  {
    type: "user",
    uuid: "u2",
    parentUuid: "a1",
    timestamp: "2026-04-24T10:00:06.000Z",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_01", content: "hello from file" }],
    },
  },
  { type: "ai-title", title: "Reading a file" },
]

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "projectflows-import-"))
const claudePath = path.join(tmpDir, "claude.jsonl")
writeFileSync(claudePath, claudeFixture.map((l) => JSON.stringify(l)).join("\n"))

const claudeResult = await importClaudeSession({
  projectID: "prj_test",
  sourcePath: claudePath,
})
console.log("CLAUDE:", claudeResult)

const claudeSession = sqlite
  .prepare("SELECT vendor, native_id, title FROM session WHERE id = ?")
  .get(claudeResult.sessionID) as any
console.log("  session row:", claudeSession)
const claudeWithParts = await Session.messages({ sessionID: claudeResult.sessionID })
const claudeMessages = claudeWithParts.map((m) => ({
  id: m.info.id,
  native_id: (m.info as any)._native_id,
  role: m.info.role,
}))
console.log("  messages:", claudeMessages)
const claudeParts = claudeWithParts.flatMap((m) =>
  m.parts.map((p: any) => ({ type: p.type, tool_status: p.state?.status, native_id: p._native_id })),
)
console.log("  parts:", claudeParts)

// ─── Codex fixture ───────────────────────────────────────────────────────────

const codexFixture = [
  {
    type: "session_meta",
    timestamp: "2026-04-24T11:00:00.000Z",
    payload: {
      id: "01K5N3XABCDEF",
      cwd: "/home/me/proj",
      cli_version: "0.55.0",
      base_instructions: { text: "You are Codex..." },
    },
  },
  {
    type: "turn_context",
    timestamp: "2026-04-24T11:00:01.000Z",
    payload: { cwd: "/home/me/proj", model: "gpt-5.2-codex", effort: "high" },
  },
  {
    type: "response_item",
    timestamp: "2026-04-24T11:00:02.000Z",
    payload: {
      type: "message",
      id: "msg_u1",
      role: "user",
      content: [{ type: "input_text", text: "What time is it?" }],
    },
  },
  {
    type: "response_item",
    timestamp: "2026-04-24T11:00:03.000Z",
    payload: {
      type: "reasoning",
      id: "rs_1",
      summary: [{ type: "summary_text", text: "Call the clock tool" }],
      encrypted_content: "enc-xxx",
    },
  },
  {
    type: "response_item",
    timestamp: "2026-04-24T11:00:04.000Z",
    payload: {
      type: "function_call",
      id: "fc_1",
      call_id: "call_001",
      name: "get_time",
      arguments: '{"tz":"UTC"}',
    },
  },
  {
    type: "response_item",
    timestamp: "2026-04-24T11:00:05.000Z",
    payload: { type: "function_call_output", call_id: "call_001", output: "12:00 UTC" },
  },
  {
    type: "response_item",
    timestamp: "2026-04-24T11:00:06.000Z",
    payload: {
      type: "message",
      id: "msg_a1",
      role: "assistant",
      content: [{ type: "output_text", text: "It is 12:00 UTC." }],
    },
  },
  {
    type: "event_msg",
    timestamp: "2026-04-24T11:00:07.000Z",
    payload: { type: "thread_name_updated", title: "Time check" },
  },
]

const codexPath = path.join(tmpDir, "codex.jsonl")
writeFileSync(codexPath, codexFixture.map((l) => JSON.stringify(l)).join("\n"))

const codexResult = await importCodexSession({
  projectID: "prj_test",
  sourcePath: codexPath,
})
console.log("CODEX:", codexResult)

const codexSession = sqlite
  .prepare("SELECT vendor, native_id, title FROM session WHERE id = ?")
  .get(codexResult.sessionID) as any
console.log("  session row:", codexSession)
const codexWithParts = await Session.messages({ sessionID: codexResult.sessionID })
const codexMessages = codexWithParts.map((m) => ({ id: m.info.id, role: m.info.role }))
console.log("  messages:", codexMessages)
const codexParts = codexWithParts.flatMap((m) =>
  m.parts.map((p: any) => ({ type: p.type, tool_status: p.state?.status, tool: p.tool })),
)
console.log("  parts:", codexParts)

// ─── Assertions ──────────────────────────────────────────────────────────────

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg)
    process.exit(1)
  }
}

assert(claudeSession.vendor === "claude", "claude session vendor")
assert(claudeSession.native_id === "claude-abc", "claude session native id")
assert(claudeSession.title === "Reading a file", "claude session title from ai-title")
assert(claudeMessages.length === 2, "claude: 2 messages (user + assistant, tool-result carrier skipped)")
assert(claudeMessages[0].role === "user" && claudeMessages[0].native_id === "u1", "claude: user native_id")
assert(claudeMessages[1].role === "assistant" && claudeMessages[1].native_id === "a1", "claude: assistant native_id")
assert(claudeParts.some((p) => p.type === "reasoning"), "claude: reasoning part")
assert(
  claudeParts.some((p) => p.type === "tool" && p.tool_status === "completed"),
  "claude: tool completed after tool_result merge",
)

assert(codexSession.vendor === "codex", "codex session vendor")
assert(codexSession.native_id === "01K5N3XABCDEF", "codex session native id")
assert(codexSession.title === "Time check", "codex session title from thread_name_updated")
assert(codexMessages.length === 2, "codex: user + assistant")
assert(codexMessages[0].role === "user", "codex user first")
assert(codexMessages[1].role === "assistant", "codex assistant second")
assert(codexParts.some((p) => p.type === "reasoning"), "codex: reasoning part")
assert(codexParts.some((p) => p.type === "tool" && p.tool_status === "completed"), "codex: tool completed")
assert(codexParts.some((p) => p.type === "text"), "codex: final text")

console.log("\nALL CHECKS PASSED")
