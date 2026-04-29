import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./session-search.json"

function isGlobPattern(query: string): boolean {
  return /[*?[]/.test(query)
}

async function matchesGlobTitle(title: string | null | undefined, pattern: string): Promise<boolean> {
  if (!title) return false
  const { minimatch } = await import("minimatch")
  return minimatch(title.toLowerCase(), pattern.toLowerCase(), { dot: true })
}

/**
 * Resolve the calling agent's storage ID.
 * ctx.agent is the agent's display name (entry.config.name), but session.agentID
 * stores the storage ID (entry.id). We list agents and match on either field so
 * owned_only works regardless of whether name and ID happen to match.
 */
async function resolveCallerAgentId(ctxAgent: string, agentsSvc: any): Promise<string> {
  try {
    const all: any[] = await agentsSvc.list()
    const match = all.find((a: any) => a.id === ctxAgent || a.name === ctxAgent)
    return match?.id ?? ctxAgent
  } catch {
    return ctxAgent
  }
}

const parameters = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Search query to filter sessions by title (case-insensitive). Supports glob patterns: '*keyword*' matches titles containing keyword, 'prefix*' matches titles starting with prefix, 'a?c' uses single-character wildcard. Plain terms use substring matching.",
      ),
    directory: z.string().optional().describe("Filter sessions by project directory"),
    session_type: z.enum(["role", "scope", "worker", "scratchpad"]).optional().describe("Filter by session type"),
    status: z.enum(["active", "archived", "closed"]).optional().describe("Filter by session status"),
    agent_id: z.string().optional().describe("Filter by assigned agent ID"),
    owned_only: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, only return sessions owned by the calling agent (resolved by agent ID, not display name). When false (default), sessions across all agents are returned. Cannot be combined with agent_id.",
      ),
    exclude_session_id: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe("Session ID or list of session IDs to exclude from results. Useful for removing the current session from candidate lists."),
    roots_only: z.boolean().optional().default(false).describe("Only return root sessions (no parent)"),
    limit: z.number().optional().describe("Maximum number of sessions to return"),
    start_after: z.number().optional().describe("Filter sessions updated after this timestamp (ms since epoch)"),
    session_id: z.string().optional().describe("Get specific session by ID (overrides other filters)"),
  })
  .superRefine((value, ctx) => {
    if (value.session_id && (value.query || value.directory || value.session_type || value.agent_id || value.roots_only || value.owned_only || value.exclude_session_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["session_id"],
        message: "session_id cannot be combined with other filters",
      })
    }
    if (value.owned_only && value.agent_id) {
      ctx.addIssue({
        code: "custom",
        path: ["owned_only"],
        message: "owned_only cannot be combined with agent_id — use one or the other",
      })
    }
  })

export const SessionSearchTool = Tool.define("session_search", {
  description: toolDef.description,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")

    // Resolve caller's agent ID once (name → id lookup to fix owned_only matching)
    const callerAgentId = h.agents ? await resolveCallerAgentId(ctx.agent, h.agents) : ctx.agent

    // Build exclusion set
    const excludeIds = new Set(
      params.exclude_session_id
        ? Array.isArray(params.exclude_session_id)
          ? params.exclude_session_id
          : [params.exclude_session_id]
        : [],
    )

    try {
      // If session_id is provided, fetch that specific session
      if (params.session_id) {
        const session = await sessionSvc.get(params.session_id)
        if (!session) {
          return {
            title: "Session Not Found",
            metadata: { found: false } as any,
            output: JSON.stringify({ error: `Session '${params.session_id}' not found.` }),
          }
        }

        return {
          title: `Session Found: ${session.title || params.session_id}`,
          metadata: {
            found: true,
            sessionId: session.id,
            sessionType: session.sessionType,
            sessionStatus: session.sessionStatus,
            agentId: session.agentID,
          } as any,
          output: JSON.stringify({ count: 1, sessions: [formatSession(session, ctx.sessionID, callerAgentId)] }, null, 2),
        }
      }

      // Resolve effective agent filter:
      // owned_only resolves to the caller's storage ID (not display name)
      const effectiveAgentId = params.owned_only ? callerAgentId : params.agent_id

      // Glob patterns need client-side matching; plain terms are handled server-side
      const useGlobMatching = params.query ? isGlobPattern(params.query) : false

      // Search for sessions using filters
      const sessions: any[] = []
      const searchOptions: any = {
        directory: params.directory,
        roots: params.roots_only,
        start: params.start_after,
        // Pass query to server only for plain substring search; glob queries are applied client-side
        search: params.query && !useGlobMatching ? params.query : undefined,
        limit: params.limit,
      }

      for await (const session of sessionSvc.list(searchOptions)) {
        // Exclusion list
        if (excludeIds.has(session.id)) continue

        // Apply additional filters that aren't supported by the base list API
        if (params.session_type && session.sessionType !== params.session_type) continue
        if (params.status && session.sessionStatus !== params.status) continue
        if (effectiveAgentId && session.agentID !== effectiveAgentId) continue

        // Apply client-side glob pattern matching for title
        if (useGlobMatching && params.query) {
          if (!(await matchesGlobTitle(session.title, params.query))) continue
        }

        sessions.push(session)
      }

      if (sessions.length === 0) {
        return {
          title: "No Sessions Found",
          metadata: { count: 0, found: false } as any,
          output: JSON.stringify({ count: 0, sessions: [] }),
        }
      }

      return {
        title: `Found ${sessions.length} Session${sessions.length === 1 ? "" : "s"}`,
        metadata: { count: sessions.length, sessionIds: sessions.map((s) => s.id), found: true } as any,
        output: JSON.stringify({ count: sessions.length, sessions: sessions.map((s) => formatSession(s, ctx.sessionID, callerAgentId)) }, null, 2),
      }
    } catch (error) {
      return {
        title: "Session Search Failed",
        metadata: { found: false, error: error instanceof Error ? error.message : String(error) } as any,
        output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      }
    }
  },
})

function formatSession(session: any, currentSessionId?: string, callerAgentId?: string): Record<string, any> {
  const result: Record<string, any> = {
    id: session.id,
    title: session.title || null,
    type: session.sessionType || null,
    status: session.sessionStatus || null,
    agentId: session.agentID || null,
    directory: session.directory || null,
    created: session.time?.created ?? null,
    updated: session.time?.updated ?? null,
    parentId: session.parentSessionID || null,
    messageCount: session.messageCount ?? null,
  }

  if (currentSessionId && session.id === currentSessionId) {
    result.is_current_session = true
  }

  if (callerAgentId && session.agentID && session.agentID === callerAgentId) {
    result.is_owned_by_searcher = true
  }

  return result
}
