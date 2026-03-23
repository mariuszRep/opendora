import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import DESCRIPTION from "./session-search.txt"

const parameters = z
  .object({
    query: z.string().optional().describe("Search query to filter sessions by title (case-insensitive)"),
    directory: z.string().optional().describe("Filter sessions by project directory"),
    session_type: z.enum(["role", "scope", "worker", "scratchpad"]).optional().describe("Filter by session type"),
    status: z.enum(["active", "archived", "closed"]).optional().describe("Filter by session status"),
    agent_id: z.string().optional().describe("Filter by assigned agent ID"),
    roots_only: z.boolean().optional().default(false).describe("Only return root sessions (no parent)"),
    limit: z.number().optional().describe("Maximum number of sessions to return"),
    start_after: z.number().optional().describe("Filter sessions updated after this timestamp (ms since epoch)"),
    session_id: z.string().optional().describe("Get specific session by ID (overrides other filters)"),
  })
  .superRefine((value, ctx) => {
    if (value.session_id && (value.query || value.directory || value.session_type || value.agent_id || value.roots_only)) {
      ctx.addIssue({
        code: "custom",
        path: ["session_id"],
        message: "session_id cannot be combined with other filters",
      })
    }
  })

export const SessionSearchTool = Tool.define("session_search", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")

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
          output: JSON.stringify({ count: 1, sessions: [formatSession(session)] }, null, 2),
        }
      }

      // Search for sessions using filters
      const sessions: any[] = []
      const searchOptions: any = {
        directory: params.directory,
        roots: params.roots_only,
        start: params.start_after,
        search: params.query,
        limit: params.limit,
      }

      for await (const session of sessionSvc.list(searchOptions)) {
        // Apply additional filters that aren't supported by the base list API
        if (params.session_type && session.sessionType !== params.session_type) continue
        if (params.status && session.sessionStatus !== params.status) continue
        if (params.agent_id && session.agentID !== params.agent_id) continue

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
        output: JSON.stringify({ count: sessions.length, sessions: sessions.map(formatSession) }, null, 2),
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

function formatSession(session: any): Record<string, any> {
  const result: Record<string, any> = {
    id: session.id,
    title: session.title || null,
    type: session.sessionType || null,
    status: session.sessionStatus || null,
    agentId: session.agentID || null,
    directory: session.directory || null,
    created: session.time?.created ?? null,
    updated: session.time?.updated ?? null,
    parentId: session.parentID || null,
    messageCount: session.messageCount ?? null,
  }

  return result
}
