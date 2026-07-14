import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { and, eq } from "drizzle-orm"
import { configure, getConfig, type SessionCoreConfig } from "../src/config"
import { migrateAllSessions, migrateSession } from "../src/graph-migration"
import { Session } from "../src/session"
import {
  EdgesTable,
  EntriesTable,
  GraphMigrationStateTable,
  MessageTable,
  PartTable,
  SessionTable,
} from "../src/session.sql"
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
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      parent_message_id TEXT,
      data TEXT NOT NULL,
      native_id TEXT,
      vendor_raw TEXT
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL,
      native_id TEXT,
      vendor_raw TEXT
    );
    CREATE TABLE entry_edge (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_entry_id TEXT NOT NULL,
      target_entry_id TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      display_order INTEGER,
      metadata TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
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
    CREATE TABLE graph_migration_state (
      id TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL,
      metadata TEXT
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

function insertMessage(
  sqlite: Database,
  input: { id: string; sessionID?: string; parent?: string | null; role: "user" | "assistant"; created: number; from?: unknown },
) {
  sqlite.run(
    "INSERT INTO message (id, session_id, time_created, time_updated, parent_message_id, data) VALUES (?, ?, ?, ?, ?, ?)",
    [
      input.id,
      input.sessionID ?? "session_1",
      input.created,
      input.created,
      input.parent ?? null,
      JSON.stringify({
        role: input.role,
        time: { created: input.created },
        from: input.from,
      }),
    ],
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

describe("session graph ledger migration", () => {
  test("backfills messages, parent links, legacy edges, and tool lifecycle entries", async () => {
    const { sqlite, db } = createDb()
    insertSession(sqlite)
    insertMessage(sqlite, { id: "message_1", role: "user", created: 100 })
    insertMessage(sqlite, {
      id: "message_2",
      role: "assistant",
      created: 200,
      parent: "message_1",
      from: { kind: "agent", id: "agent" },
    })
    sqlite.run(
      "INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)",
      [
        "part_tool",
        "message_2",
        "session_1",
        210,
        220,
        JSON.stringify({
          type: "tool",
          callID: "call_1",
          tool: "shell",
          state: {
            status: "completed",
            input: { command: "pwd" },
            output: "/tmp/project",
            title: "shell",
            metadata: {},
            time: { start: 210, end: 220 },
          },
        }),
      ],
    )
    sqlite.run(
      "INSERT INTO entry_edge (id, session_id, source_entry_id, target_entry_id, edge_type, display_order, metadata, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["legacy_edge", "session_1", "message_1", "message_2", "fan_out", null, null, 205, 205],
    )

    const first = await migrateSession("session_1")
    const second = await migrateSession("session_1")

    expect(first).toBeGreaterThan(0)
    expect(second).toBe(0)
    expect(db.select().from(EntriesTable).all().map((e) => e.id).sort()).toEqual([
      "message_1",
      "message_2",
      "part_tool",
      "part_tool:result",
    ])
    expect(edgeCount(db, { fromID: "session_1", type: "contains" })).toBe(2)
    expect(edgeCount(db, { fromID: "message_1", toID: "message_2", type: "reply_to" })).toBe(1)
    expect(edgeCount(db, { fromID: "message_1", toID: "message_2", type: "branch" })).toBe(1)
    expect(edgeCount(db, { fromID: "part_tool", toID: "shell", type: "used" })).toBe(1)
    expect(edgeCount(db, { fromID: "part_tool", toID: "part_tool:result", type: "caused" })).toBe(1)
  })

  test("migrateAllSessions writes a completion marker and skips later full scans", async () => {
    const { sqlite, db } = createDb()
    insertSession(sqlite, "session_1")
    insertMessage(sqlite, { id: "message_1", role: "user", created: 100 })

    await migrateAllSessions()
    const markers = db.select().from(GraphMigrationStateTable).all()
    expect(markers).toHaveLength(1)

    insertSession(sqlite, "session_2")
    insertMessage(sqlite, { id: "message_2", sessionID: "session_2", role: "user", created: 200 })
    await migrateAllSessions()

    expect(db.select().from(EntriesTable).where(eq(EntriesTable.id, "message_2")).all()).toHaveLength(0)
    await migrateSession("session_2")
    expect(db.select().from(EntriesTable).where(eq(EntriesTable.id, "message_2")).all()).toHaveLength(1)
  })
})

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
