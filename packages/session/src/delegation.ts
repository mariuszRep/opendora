/**
 * Durable record of an async agent__<name> delegation, keyed to the child
 * user-message that started the delegated turn (not to the child session) so
 * that a long-lived conversational child can field follow-up questions from
 * several askers over its life, each waking the right asker with the right
 * answer. Stored as a "delegated_to" edge on the universal graph
 * (session -> entry) so it survives a restart — see packages/session/src/types.ts.
 *
 * Three delivery layers all funnel through deliver()'s pending->delivering
 * CAS, so a double-fire can't inject a completion twice:
 *   1. happy path — the child's own loop() promise resolves (prompt.ts)
 *   2. backstop  — session.status idle on the bus (delegation-listener.ts)
 *   3. recovery  — boot reconcile scans leftover "pending" edges (this file)
 */

import { eq, and, sql } from "drizzle-orm"
import { EdgesTable } from "./session.sql.ts"
import { Identifier } from "@projectflows/util/id"
import { getConfig } from "./config.ts"

export namespace Delegation {
  export type Status = "pending" | "delivering" | "done" | "failed" | "cancelled"
  export type State = "completed" | "error" | "incomplete" | "cancelled"

  export type Metadata = {
    status: Status
    childSessionID: string
    /** Message in the asker session that made this call — the completion is threaded under it. */
    askerMessageID?: string
    toolCallID?: string
    agent: string
    description?: string
    mode: "sync" | "async"
    resultSchema?: unknown
    state?: State
    reason?: string
    result?: string
    createdAt: number
    completedAt?: number
  }

  export type Edge = {
    id: string
    askerSessionID: string
    childMessageID: string
    metadata: Metadata
  }

  function fromRow(row: typeof EdgesTable.$inferSelect): Edge {
    return {
      id: row.id,
      askerSessionID: row.from_id,
      childMessageID: row.to_id,
      metadata: row.metadata as Metadata,
    }
  }

  export type RecordInput = {
    askerSessionID: string
    askerMessageID?: string
    childSessionID: string
    /** id of the user message that started the child's turn — how loop-end finds this edge again */
    childMessageID: string
    agent: string
    description?: string
    mode: "sync" | "async"
    toolCallID?: string
    resultSchema?: unknown
  }

  export function record(input: RecordInput): string {
    const db = getConfig().db
    const id = Identifier.ascending("edge")
    const now = Date.now()
    const metadata: Metadata = {
      status: "pending",
      childSessionID: input.childSessionID,
      askerMessageID: input.askerMessageID,
      toolCallID: input.toolCallID,
      agent: input.agent,
      description: input.description,
      mode: input.mode,
      resultSchema: input.resultSchema,
      createdAt: now,
    }
    db
      .insert(EdgesTable)
      .values({
        id,
        from_type: "session",
        from_id: input.askerSessionID,
        to_type: "entry",
        to_id: input.childMessageID,
        type: "delegated_to",
        seq_in_parent: null,
        label: null,
        metadata,
        created_at: new Date(now).toISOString(),
      })
      .run()
    return id
  }

  export function getForChildMessage(childMessageID: string): Edge | undefined {
    const db = getConfig().db
    const row = db
      .select()
      .from(EdgesTable)
      .where(and(eq(EdgesTable.to_id, childMessageID), eq(EdgesTable.type, "delegated_to")))
      .limit(1)
      .get()
    return row ? fromRow(row) : undefined
  }

  export function pendingForChild(childSessionID: string): Edge[] {
    const db = getConfig().db
    const rows = db
      .select()
      .from(EdgesTable)
      .where(
        and(
          eq(EdgesTable.type, "delegated_to"),
          sql`json_extract(metadata, '$.childSessionID') = ${childSessionID}`,
          sql`json_extract(metadata, '$.status') = 'pending'`,
        ),
      )
      .all()
    return rows.map(fromRow)
  }

  export function countPendingForAsker(askerSessionID: string): number {
    return pendingForAsker(askerSessionID).length
  }

  export function pendingForAsker(askerSessionID: string): Edge[] {
    const db = getConfig().db
    const rows = db
      .select()
      .from(EdgesTable)
      .where(
        and(
          eq(EdgesTable.from_id, askerSessionID),
          eq(EdgesTable.type, "delegated_to"),
          sql`json_extract(metadata, '$.status') = 'pending'`,
        ),
      )
      .all()
    return rows.map(fromRow)
  }

  export function allPending(): Edge[] {
    const db = getConfig().db
    const rows = db
      .select()
      .from(EdgesTable)
      .where(and(eq(EdgesTable.type, "delegated_to"), sql`json_extract(metadata, '$.status') = 'pending'`))
      .all()
    return rows.map(fromRow)
  }

  /** CAS pending -> delivering. Returns the edge iff this call won the race. */
  function claim(edgeID: string): Edge | undefined {
    const db = getConfig().db
    const row = db
      .update(EdgesTable)
      .set({ metadata: sql`json_set(metadata, '$.status', 'delivering')` })
      .where(and(eq(EdgesTable.id, edgeID), sql`json_extract(metadata, '$.status') = 'pending'`))
      .returning()
      .get()
    return row ? fromRow(row) : undefined
  }

  function finalize(
    edgeID: string,
    patch: { status: Exclude<Status, "pending" | "delivering">; state?: State; reason?: string; result?: string },
  ) {
    const db = getConfig().db
    const now = Date.now()
    db
      .update(EdgesTable)
      .set({
        metadata: sql`json_set(
          metadata,
          '$.status', ${patch.status},
          '$.state', ${patch.state ?? null},
          '$.reason', ${patch.reason ?? null},
          '$.result', ${patch.result ?? null},
          '$.completedAt', ${now}
        )`,
      })
      .where(eq(EdgesTable.id, edgeID))
      .run()
  }

  /**
   * Sync delegations already have their result in hand when agent__<name>'s
   * execute() returns, so there is nothing to "deliver" — just record the
   * outcome for graph history/UI (Phase 7) without going through the CAS.
   */
  export function finalizeSync(edgeID: string, input: { state: State; result?: string; reason?: string }) {
    finalize(edgeID, { status: "done", state: input.state, result: input.result, reason: input.reason })
  }

  /** CAS (pending|delivering) -> cancelled. No-op if already terminal. */
  export function cancel(edgeID: string) {
    const db = getConfig().db
    db
      .update(EdgesTable)
      .set({ metadata: sql`json_set(metadata, '$.status', 'cancelled', '$.state', 'cancelled')` })
      .where(
        and(
          eq(EdgesTable.id, edgeID),
          sql`json_extract(metadata, '$.status') in ('pending', 'delivering')`,
        ),
      )
      .run()
  }

  /**
   * Transitively cancels everything this session is waiting on. A child only
   * has its own loop cancelled if NO OTHER asker still has a pending question
   * into it — a long-lived conversational session serving several askers must
   * not die just because one of them aborted. The `visited` set guards against
   * cycles: this calls SessionPrompt.cancel on descendants, which itself (via
   * the explicit cascade opt-in wired in prompt.ts) calls back into this.
   */
  export async function cancelSubtree(askerSessionID: string, visited: Set<string> = new Set()): Promise<void> {
    if (visited.has(askerSessionID)) return
    visited.add(askerSessionID)

    const edges = pendingForAsker(askerSessionID)
    if (edges.length === 0) return

    const { SessionPrompt } = await import("./prompt.ts")
    for (const edge of edges) {
      cancel(edge.id)
      const childID = edge.metadata.childSessionID
      if (visited.has(childID)) continue
      const othersStillWaiting = pendingForChild(childID).some((e) => e.askerSessionID !== askerSessionID)
      if (othersStillWaiting) continue
      SessionPrompt.cancel(childID, { cascade: true })
    }
  }

  export type Classification = { state: State; reason?: string; result?: string }

  /**
   * Loop-end is the trigger, not the verdict — the loop can end because the
   * model chose to stop, because it errored, because it was truncated, or
   * because the step budget ran out (see prompt.ts's isLastStep, which tags
   * finish="step-limit" specifically so this can tell that apart from a
   * genuine "stop"). A budget-exhausted child looks identical to a finished
   * one unless that tag is checked here.
   */
  export function classify(info: { finish?: string; error?: { name?: string } | unknown }): Classification {
    const errName = (info.error as { name?: string } | undefined)?.name
    if (errName === "MessageAbortedError") return { state: "cancelled", reason: "aborted" }
    if (info.error) return { state: "error", reason: errName }
    if (info.finish === "length" || info.finish === "step-limit") return { state: "incomplete", reason: info.finish }
    return { state: "completed" }
  }

  function buildEnvelope(input: {
    childSessionID: string
    agent: string
    description?: string
    classification: Classification
  }): string {
    const { state, reason, result } = input.classification
    const lines = [
      `<task_completed id="${input.childSessionID}" agent="${input.agent}" state="${state}"${reason ? ` reason="${reason}"` : ""}>`,
    ]
    if (input.description) lines.push(`<summary>${input.description}</summary>`)
    if (result) lines.push(`<result>`, result, `</result>`)
    if (state === "completed") {
      lines.push(
        `<follow_up>This session is still live. Ask follow-ups via session_message(session_id:"${input.childSessionID}", action:"message") instead of starting a new task.</follow_up>`,
      )
    } else if (state === "incomplete") {
      lines.push(
        `<follow_up>This task did not finish (${reason ?? "incomplete"}). Resume it via session_message(session_id:"${input.childSessionID}", action:"message").</follow_up>`,
      )
    }
    lines.push(`</task_completed>`)
    return lines.join("\n")
  }

  /**
   * Attempts to deliver a completion to the asker session that recorded a
   * pending delegation edge for this child message. Idempotent — only the
   * caller that wins the pending->delivering CAS actually injects into the
   * asker; every other caller (or a duplicate wake) no-ops. Dynamically
   * imports prompt.ts to avoid a static import cycle (prompt.ts statically
   * imports Delegation to hook its own loop-end).
   */
  export async function deliver(childMessageID: string, classification: Classification): Promise<boolean> {
    const edge = getForChildMessage(childMessageID)
    if (!edge) return false
    const claimed = claim(edge.id)
    if (!claimed) return false

    const meta = claimed.metadata
    const envelope = buildEnvelope({
      childSessionID: meta.childSessionID,
      agent: meta.agent,
      description: meta.description,
      classification,
    })

    try {
      const { SessionPrompt } = await import("./prompt.ts")

      const busy = (() => {
        try {
          SessionPrompt.assertNotBusy(edge.askerSessionID)
          return false
        } catch {
          return true
        }
      })()

      const posted = await SessionPrompt.prompt({
        sessionID: edge.askerSessionID,
        parentMessageID: meta.askerMessageID,
        hidden: true,
        noWait: true,
        queued: busy,
        parts: [{ type: "text", text: envelope }],
      })

      if (busy) {
        await SessionPrompt.requestImmediateActivation({ sessionID: edge.askerSessionID, messageID: posted.info.id })
      }

      finalize(edge.id, {
        status: classification.state === "cancelled" ? "cancelled" : classification.state === "error" ? "failed" : "done",
        state: classification.state,
        reason: classification.reason,
        result: classification.result,
      })
      return true
    } catch (err) {
      finalize(edge.id, {
        status: "failed",
        state: "error",
        reason: `delivery-failed: ${err instanceof Error ? err.message : String(err)}`,
      })
      return false
    }
  }

  /**
   * Boot-time recovery: pending edges whose child already produced a final
   * assistant reply get delivered now; a child that died mid-turn or no
   * longer exists is reported to its asker as failed rather than silently
   * dropped. The child itself is never auto-resumed here.
   */
  export async function reconcileOnBoot(): Promise<void> {
    const { MessageV2 } = await import("./message-v2.ts")
    for (const edge of allPending()) {
      const meta = edge.metadata
      const childMsg = await MessageV2.get({ sessionID: meta.childSessionID, messageID: edge.childMessageID }).catch(
        () => undefined,
      )
      if (!childMsg) {
        await deliver(edge.childMessageID, {
          state: "error",
          reason: "interrupted-by-restart",
          result: "Child session or message no longer exists.",
        })
        continue
      }

      let finalAssistant: import("./message-v2.ts").MessageV2.WithParts | undefined
      for await (const msg of MessageV2.stream(meta.childSessionID)) {
        if (
          msg.info.role === "assistant" &&
          msg.info.finish &&
          !["tool-calls", "unknown"].includes(msg.info.finish)
        ) {
          finalAssistant = msg
        }
      }

      if (finalAssistant) {
        const text = finalAssistant.parts.findLast((p) => p.type === "text")?.text ?? ""
        await deliver(edge.childMessageID, { ...classify(finalAssistant.info as any), result: text })
      } else {
        await deliver(edge.childMessageID, {
          state: "error",
          reason: "interrupted-by-restart",
          result: "Child never produced a final response before the restart.",
        })
      }
    }
  }
}
