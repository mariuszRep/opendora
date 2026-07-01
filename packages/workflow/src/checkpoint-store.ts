import { Database } from "@projectflows/storage/db"
import { WorkflowRunCheckpointTable } from "@projectflows/session/sql"
import { Identifier } from "@projectflows/util/id"
import { eq, desc, and, ne } from "drizzle-orm"

export type StepJournalEntry = {
  stepId: string
  nodeId: string
  nodeType: string
  completedAt: number
}

type ActiveRunRef = {
  ctx: Record<string, unknown>
  stepJournal: StepJournalEntry[]
}

const _activeRuns = new Map<string, ActiveRunRef>()

export function registerActiveRun(runId: string, ref: ActiveRunRef): void {
  _activeRuns.set(runId, ref)
}

export function deregisterActiveRun(runId: string): void {
  _activeRuns.delete(runId)
}

export type WorkflowRunCheckpoint = typeof WorkflowRunCheckpointTable.$inferSelect

export namespace CheckpointStore {
  export async function getLatest(runId: string): Promise<WorkflowRunCheckpoint | null> {
    const row = Database.Client()
      .select()
      .from(WorkflowRunCheckpointTable)
      .where(eq(WorkflowRunCheckpointTable.run_id, runId))
      .orderBy(desc(WorkflowRunCheckpointTable.created_at))
      .limit(1)
      .get()
    return (row as WorkflowRunCheckpoint | undefined) ?? null
  }

  export async function append(entry: {
    runId: string
    workflowId: string
    nodeId: string
    nodeType: string
    ctx: Record<string, unknown>
    stepJournal: StepJournalEntry[]
    status?: "running" | "suspended" | "done" | "error"
    cursor?: { nodeId: string }
    error?: string
  }): Promise<void> {
    const checkpointId = Identifier.ascending("checkpoint")
    Database.Client()
      .insert(WorkflowRunCheckpointTable)
      .values({
        run_id: entry.runId,
        checkpoint_id: checkpointId,
        workflow_id: entry.workflowId,
        status: entry.status ?? "running",
        cursor: entry.cursor ?? null,
        ctx: entry.ctx,
        step_journal: entry.stepJournal,
        error: entry.error ?? null,
        created_at: Date.now(),
      } as any)
      .run()
  }

  export async function complete(
    runId: string,
    ctx: Record<string, unknown>,
    stepJournal: StepJournalEntry[],
  ): Promise<void> {
    const checkpointId = Identifier.ascending("checkpoint")
    Database.Client()
      .insert(WorkflowRunCheckpointTable)
      .values({
        run_id: runId,
        checkpoint_id: checkpointId,
        workflow_id: _getWorkflowId(runId) ?? "unknown",
        status: "done",
        cursor: null,
        ctx,
        step_journal: stepJournal,
        error: null,
        created_at: Date.now(),
      } as any)
      .run()
  }

  export async function markError(runId: string, workflowId: string, error: string): Promise<void> {
    const checkpointId = Identifier.ascending("checkpoint")
    const latest = await getLatest(runId)
    Database.Client()
      .insert(WorkflowRunCheckpointTable)
      .values({
        run_id: runId,
        checkpoint_id: checkpointId,
        workflow_id: workflowId,
        status: "error",
        cursor: null,
        ctx: latest?.ctx ?? {},
        step_journal: latest?.step_journal ?? [],
        error,
        created_at: Date.now(),
      } as any)
      .run()
  }

  export async function flushAll(): Promise<number> {
    let count = 0
    for (const [runId, ref] of _activeRuns) {
      const latest = await getLatest(runId)
      if (!latest) continue
      const checkpointId = Identifier.ascending("checkpoint")
      Database.Client()
        .insert(WorkflowRunCheckpointTable)
        .values({
          run_id: runId,
          checkpoint_id: checkpointId,
          workflow_id: latest.workflow_id,
          status: "suspended",
          cursor: null,
          ctx: ref.ctx,
          step_journal: ref.stepJournal,
          error: null,
          created_at: Date.now(),
        } as any)
        .run()
      count++
    }
    return count
  }

  export async function findIncomplete(): Promise<WorkflowRunCheckpoint[]> {
    // Get the latest checkpoint per run_id via a subquery, then filter by status.
    // Filtering first would expose intermediate "running" rows from completed runs
    // whose final "done" row got excluded by the WHERE clause.
    const latestPerRun = Database.Client()
      .select()
      .from(WorkflowRunCheckpointTable)
      .orderBy(desc(WorkflowRunCheckpointTable.created_at))
      .all() as WorkflowRunCheckpoint[]

    const seen = new Set<string>()
    const result: WorkflowRunCheckpoint[] = []
    for (const row of latestPerRun) {
      if (!seen.has(row.run_id)) {
        seen.add(row.run_id)
        if (row.status !== "done" && row.status !== "error") {
          result.push(row)
        }
      }
    }
    return result
  }
}

function _getWorkflowId(runId: string): string | null {
  const latest = Database.Client()
    .select({ workflow_id: WorkflowRunCheckpointTable.workflow_id })
    .from(WorkflowRunCheckpointTable)
    .where(eq(WorkflowRunCheckpointTable.run_id, runId))
    .orderBy(desc(WorkflowRunCheckpointTable.created_at))
    .limit(1)
    .get()
  return (latest as { workflow_id: string } | undefined)?.workflow_id ?? null
}
