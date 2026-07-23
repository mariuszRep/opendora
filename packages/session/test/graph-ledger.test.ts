import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { and, eq } from "drizzle-orm"
import { configure, getConfig, type SessionCoreConfig } from "../src/config"
import { Session } from "../src/session"
import { EdgesTable, EntriesTable, SessionTable } from "../src/session.sql"
import * as schema from "../src/session.sql"

let previousConfig: SessionCoreConfig | undefined

function createDb() {
  if (!previousConfig) {
    try {
      previousConfig = getConfig()
    } catch {
      previousConfig = undefined
    }
  }
  const sqlite = new Database(":memory:")
  sqlite.exec(`
    CREATE TABLE project (
      id TEXT PRIMARY KEY,
      worktree TEXT NOT NULL,
      sandboxes TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    );
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      directory TEXT NOT NULL,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      share_url TEXT,
      summary_additions INTEGER,
      summary_deletions INTEGER,
      summary_files INTEGER,
      summary_diffs TEXT,
      revert TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_compacting INTEGER,
      time_archived INTEGER,
      session_type TEXT,
      session_status TEXT,
      agent_id TEXT,
      owner_id TEXT,
      owner_kind TEXT,
      allowed_agents TEXT,
      send_policy TEXT,
      retention TEXT,
      path TEXT,
      read_path TEXT,
      cwd TEXT,
      spawn_depth INTEGER,
      parent_session_id TEXT,
      reply_to_session_id TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_write_tokens INTEGER,
      compaction_count INTEGER,
      unlocked_tools TEXT,
      vendor TEXT,
      native_id TEXT,
      vendor_raw_header TEXT,
      model TEXT,
      workflow_run TEXT
    );
    CREATE TABLE entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      actor TEXT NOT NULL,
      runner_type TEXT NOT NULL,
      content_text TEXT,
      payload_json TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE edges (
      id TEXT PRIMARY KEY,
      from_type TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_type TEXT NOT NULL,
      to_id TEXT NOT NULL,
      type TEXT NOT NULL,
      seq_in_parent INTEGER,
      label TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
  `)
  const db = drizzle({ client: sqlite, schema })
  configure({
    db,
    dataPath: "/tmp",
    bus: { publish() {} },
  })
  sqlite.run(
    "INSERT INTO project (id, worktree, sandboxes, time_created, time_updated) VALUES (?, ?, ?, ?, ?)",
    ["project_1", "/tmp/project", "[]", 1, 1],
  )
  return { sqlite, db }
}

afterEach(() => {
  if (previousConfig) configure(previousConfig)
  previousConfig = undefined
})

function insertSession(sqlite: Database, id = "session_1") {
  sqlite.run(
    "INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, "project_1", id, "/tmp/project", id, "test", 1, 1],
  )
}

function edgeCount(db: any, input: {
  fromID?: string
  toID?: string
  type?: string
}) {
  return db
    .select()
    .from(EdgesTable)
    .where(
      and(
        ...(input.fromID ? [eq(EdgesTable.from_id, input.fromID)] : []),
        ...(input.toID ? [eq(EdgesTable.to_id, input.toID)] : []),
        ...(input.type ? [eq(EdgesTable.type, input.type as any)] : []),
      ),
    )
    .all().length
}

describe("session ledger write paths", () => {
  test("live tool parts create tool_call and tool_result entries with used/caused edges", async () => {
    const { sqlite, db } = createDb()
    insertSession(sqlite)
    await Session.updateMessage({
      id: "message_live",
      sessionID: "session_1",
      role: "assistant",
      time: { created: 100 },
      parentID: "message_user",
      modelID: "model",
      providerID: "provider",
      mode: "",
      agent: "agent",
      path: { cwd: "/tmp/project", root: "/tmp/project" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    } as any)

    await Session.updatePart({
      id: "part_live",
      sessionID: "session_1",
      messageID: "message_live",
      type: "tool",
      callID: "call_live",
      tool: "read",
      state: {
        status: "completed",
        input: { filePath: "README.md" },
        output: "content",
        title: "read",
        metadata: {},
        time: { start: 110, end: 120 },
      },
    } as any)

    expect(db.select().from(EntriesTable).where(eq(EntriesTable.id, "part_live")).get()?.type).toBe("tool_call")
    expect(db.select().from(EntriesTable).where(eq(EntriesTable.id, "part_live:result")).get()?.type).toBe("tool_result")
    expect(edgeCount(db, { fromID: "part_live", toID: "read", type: "used" })).toBe(1)
    expect(edgeCount(db, { fromID: "part_live", toID: "part_live:result", type: "caused" })).toBe(1)
  })

  test("every part type creates a matching entry and a contains edge from its message", async () => {
    const { sqlite, db } = createDb()
    insertSession(sqlite)
    await Session.updateMessage({
      id: "message_parts",
      sessionID: "session_1",
      role: "assistant",
      time: { created: 100 },
      modelID: "model",
      providerID: "provider",
      mode: "",
      agent: "agent",
      path: { cwd: "/tmp/project", root: "/tmp/project" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    } as any)

    const parts: Array<{ id: string; part: any; expectedType: import("../src/types").EntryType }> = [
      { id: "part_text", expectedType: "message", part: { type: "text", text: "hello" } },
      { id: "part_reasoning", expectedType: "message", part: { type: "reasoning", text: "thinking", time: { start: 1 } } },
      { id: "part_file", expectedType: "message", part: { type: "file", mime: "text/plain", url: "file:///a.txt" } },
      { id: "part_snapshot", expectedType: "message", part: { type: "snapshot", snapshot: "hash1" } },
      { id: "part_patch", expectedType: "message", part: { type: "patch", hash: "hash2", files: ["a.txt"] } },
      { id: "part_agent", expectedType: "message", part: { type: "agent", name: "build" } },
      { id: "part_stepstart", expectedType: "workflow_step", part: { type: "step-start" } },
      {
        id: "part_stepfinish",
        expectedType: "workflow_step",
        part: {
          type: "step-finish",
          reason: "stop",
          cost: 0,
          tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      },
      { id: "part_compaction", expectedType: "workflow_step", part: { type: "compaction", auto: true } },
      {
        id: "part_subtask",
        expectedType: "workflow_step",
        part: { type: "subtask", prompt: "do it", description: "desc", agent: "worker" },
      },
      {
        id: "part_retry",
        expectedType: "system_event",
        part: {
          type: "retry",
          attempt: 1,
          error: { name: "APIError", data: { message: "boom", isRetryable: true } },
          time: { created: 1 },
        },
      },
      {
        id: "part_fallback",
        expectedType: "system_event",
        part: {
          type: "fallback-switch",
          previousSlot: { providerID: "a", modelID: "m1" },
          newSlot: { providerID: "b", modelID: "m2" },
          groupID: "group1",
          resetAt: null,
          time: { created: 1 },
        },
      },
    ]

    for (const { id, part } of parts) {
      await Session.updatePart({
        id,
        sessionID: "session_1",
        messageID: "message_parts",
        ...part,
      } as any)
    }

    for (const { id, expectedType } of parts) {
      const entry = db.select().from(EntriesTable).where(eq(EntriesTable.id, id)).get()
      expect(entry?.type).toBe(expectedType)
      expect(edgeCount(db, { fromID: "message_parts", toID: id, type: "contains" })).toBe(1)
    }
  })

  test("workflow runs create instantiated_as edges", async () => {
    const { sqlite, db } = createDb()
    insertSession(sqlite)

    await Session.setWorkflowRun({
      sessionID: "session_1",
      workflowRun: { workflowID: "workflow_demo", workflowRunID: "workflow_run_1", startedAt: 100 },
    })

    expect(edgeCount(db, { fromID: "workflow_demo", toID: "session_1", type: "instantiated_as" })).toBe(1)
  })
})
