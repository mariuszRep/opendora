/**
 * Converts a raw SessionTable database row to SessionInfo.
 */

import type { SessionTable } from "./session.sql"
import type { RetentionPolicy, SendPolicy, SessionType, SessionStatus } from "./types"
import type { Permission } from "@opendora/permission"

type SessionRow = typeof SessionTable.$inferSelect

// Matches Session.Info from opencode/session/index.ts — kept in sync manually.
export type SessionInfo = {
  id: string
  slug: string
  projectID: string
  directory: string
  title: string
  version: string
  summary?: { additions: number; deletions: number; files: number; diffs?: unknown[] }
  share?: { url: string }
  revert?: { messageID: string; partID?: string; snapshot?: string; diff?: string }
  permission?: Permission.Ruleset
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
  path?: string
  readPath?: string
  cwd?: string
  spawnDepth?: number
  parentSessionID?: string
  replyToSessionID?: string
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
    path: row.path ?? undefined,
    readPath: row.read_path ?? undefined,
    cwd: row.cwd ?? undefined,
    spawnDepth: row.spawn_depth ?? undefined,
    parentSessionID: row.parent_session_id ?? undefined,
    replyToSessionID: row.reply_to_session_id ?? undefined,
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
