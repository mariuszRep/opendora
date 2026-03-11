/**
 * Converts a raw SessionTable database row to Session.Info.
 * Extracted to a standalone module so bus-bridge.ts can import it
 * without creating circular dependencies with session/index.ts.
 */

import type { SessionTable } from "./session.sql"
import type { RetentionPolicy, SendPolicy, SessionType, SessionStatus } from "@pingpong/core"
import type { PermissionNext } from "@/permission/next"
import type { Snapshot } from "@/snapshot"

type SessionRow = typeof SessionTable.$inferSelect

// Matches Session.Info from index.ts — kept in sync manually.
// Using a local type here avoids a circular import with session/index.ts.
export type SessionInfo = {
  id: string
  slug: string
  projectID: string
  directory: string
  parentID?: string
  title: string
  version: string
  summary?: { additions: number; deletions: number; files: number; diffs?: Snapshot.FileDiff[] }
  share?: { url: string }
  revert?: { messageID: string; partID?: string; snapshot?: string; diff?: string }
  permission?: PermissionNext.Ruleset
  time: { created: number; updated: number; compacting?: number; archived?: number }
  // PingPong fields
  sessionType?: SessionType
  sessionStatus?: SessionStatus
  agentID?: string
  ownerID?: string
  ownerKind?: "user" | "agent" | "service"
  allowedAgents?: string[]
  sendPolicy?: SendPolicy
  retention?: RetentionPolicy
  spawnDepth?: number
  spawnParentSessionID?: string
  spawnParentMessageID?: string
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; compactionCount: number }
}

export function fromRow(row: SessionRow): SessionInfo {
  const summary =
    row.summary_additions !== null || row.summary_deletions !== null || row.summary_files !== null
      ? {
          additions: row.summary_additions ?? 0,
          deletions: row.summary_deletions ?? 0,
          files: row.summary_files ?? 0,
          diffs: row.summary_diffs ?? undefined,
        }
      : undefined
  const share = row.share_url ? { url: row.share_url } : undefined
  const revert = row.revert ?? undefined

  return {
    id: row.id,
    slug: row.slug,
    projectID: row.project_id,
    directory: row.directory,
    parentID: row.parent_id ?? undefined,
    title: row.title,
    version: row.version,
    summary,
    share,
    revert,
    permission: row.permission ?? undefined,
    time: {
      created: row.time_created,
      updated: row.time_updated,
      compacting: row.time_compacting ?? undefined,
      archived: row.time_archived ?? undefined,
    },
    // PingPong fields
    sessionType: row.session_type ?? undefined,
    sessionStatus: row.session_status ?? undefined,
    agentID: row.agent_id ?? undefined,
    ownerID: row.owner_id ?? undefined,
    ownerKind: row.owner_kind ?? undefined,
    allowedAgents: row.allowed_agents ? (JSON.parse(row.allowed_agents) as string[]) : undefined,
    sendPolicy: row.send_policy ? (JSON.parse(row.send_policy) as SendPolicy) : undefined,
    retention: row.retention ? (JSON.parse(row.retention) as RetentionPolicy) : undefined,
    spawnDepth: row.spawn_depth ?? undefined,
    spawnParentSessionID: row.spawn_parent_session_id ?? undefined,
    spawnParentMessageID: row.spawn_parent_message_id ?? undefined,
    tokens:
      row.input_tokens !== null
        ? {
            input: row.input_tokens ?? 0,
            output: row.output_tokens ?? 0,
            cacheRead: row.cache_read_tokens ?? 0,
            cacheWrite: row.cache_write_tokens ?? 0,
            compactionCount: row.compaction_count ?? 0,
          }
        : undefined,
  }
}
