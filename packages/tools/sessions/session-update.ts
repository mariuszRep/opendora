import z from "zod"
import { Tool } from "../tool"
import { host } from "../host"
import toolDef from "./session-update.json"

const parameters = z.object({
  session_id: z.string().describe("ID of the session to update"),
  title: z.string().optional().describe("New title for the session"),
  agent_id: z.string().optional().describe("New agent ID to assign to the session"),
  parent_session_id: z.string().optional().describe("New parent session ID to set as the session's parent"),
  status: z.enum(["active", "archived", "closed"]).optional().describe("New status for the session"),
})

export { parameters }

type Changes = {
  title?: { old: string; new: string }
  agent_id?: { old: string | null; new: string | null }
  parent_session_id?: { old: string | null; new: string | null }
  status?: { old: string; new: string }
}

export const SessionUpdateTool = Tool.define("session_update", {
  description: toolDef.description,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const sessionSvc = h.session as any
    if (!sessionSvc || typeof sessionSvc.get !== "function") {
      throw new Error("session service not available")
    }

    const sessionId = params.session_id
    const current: any = await sessionSvc.get(sessionId)
    if (!current) {
      throw new Error(`Session '${sessionId}' not found. Use session_search to find available sessions.`)
    }

    const hasAny =
      params.title !== undefined ||
      params.agent_id !== undefined ||
      params.parent_session_id !== undefined ||
      params.status !== undefined

    if (!hasAny) {
      throw new Error("At least one update field (title, agent_id, parent_session_id, or status) must be provided.")
    }

    // Permission scoping
    let isRisky = false
    let explanation = "Updating session"
    if (params.agent_id !== undefined && params.agent_id !== current.agentID) {
      isRisky = true
      explanation = "Changing the agent assigned to this session"
    } else if (params.parent_session_id !== undefined && params.parent_session_id !== current.parentSessionID) {
      isRisky = true
      explanation = "Changing the parent session of this session"
    } else if (params.status !== undefined && params.status !== current.sessionStatus) {
      isRisky = true
      explanation = "Changing the session status"
    } else if (params.title !== undefined && params.title !== current.title) {
      explanation = "Renaming this session"
    }

    const onlyTitleChange =
      params.title !== undefined &&
      params.title !== current.title &&
      params.agent_id === undefined &&
      params.parent_session_id === undefined &&
      params.status === undefined

    const permission = onlyTitleChange ? "session_rename" : "session_update"

    await ctx.ask({
      permission,
      patterns: [],
      always: [],
      explanation: isRisky ? `This session update includes a risky change: ${explanation}` : explanation,
      metadata: { sessionId },
    })

    // Snapshot old values before any mutation — `current` may be a live reference
    // that set* calls mutate (e.g. the real DB row or an in-memory store).
    const oldTitle: string = current.title
    const oldAgentID: string | null = current.agentID ?? null
    const oldParentSessionID: string | null = current.parentSessionID ?? null
    const oldStatus: string = current.sessionStatus

    const changes: Changes = {}

    if (params.title !== undefined && params.title !== oldTitle) {
      if (typeof sessionSvc.setTitle !== "function") {
        throw new Error("Host does not support setTitle")
      }
      await sessionSvc.setTitle(sessionId, params.title)
      changes.title = { old: oldTitle, new: params.title }
    }

    if (params.agent_id !== undefined && params.agent_id !== oldAgentID) {
      if (params.agent_id) {
        const agent = await h.agents?.get(params.agent_id)
        if (!agent) {
          throw new Error(`Agent '${params.agent_id}' not found.`)
        }
      }
      if (typeof sessionSvc.setAgentID !== "function") {
        throw new Error("Host does not support setAgentID")
      }
      await sessionSvc.setAgentID(sessionId, params.agent_id ?? "")
      changes.agent_id = { old: oldAgentID, new: params.agent_id }
    }

    if (params.parent_session_id !== undefined && params.parent_session_id !== oldParentSessionID) {
      if (typeof sessionSvc.setParentSessionID !== "function") {
        throw new Error("Host does not support setParentSessionID")
      }
      await sessionSvc.setParentSessionID({
        sessionID: sessionId,
        parentSessionID: params.parent_session_id,
      })
      changes.parent_session_id = { old: oldParentSessionID, new: params.parent_session_id }
    }

    if (params.status !== undefined && params.status !== oldStatus) {
      if (typeof sessionSvc.setSessionStatus !== "function") {
        throw new Error("Host does not support setSessionStatus")
      }
      await sessionSvc.setSessionStatus(sessionId, params.status)
      changes.status = { old: oldStatus, new: params.status }
    }

    if (Object.keys(changes).length === 0) {
      return {
        title: "Session Unchanged",
        metadata: { sessionId, found: true, unchanged: true },
        output: JSON.stringify({
          message: "Requested values are identical to current values; nothing changed.",
          session: {
            id: sessionId,
            title: current.title,
            agentID: current.agentID,
            parentSessionID: current.parentSessionID ?? null,
            sessionStatus: current.sessionStatus,
          },
        }),
      }
    }

    const updated: any = (await sessionSvc.get(sessionId)) ?? current

    return {
      title: "Session Updated",
      metadata: { sessionId, found: true, changed: true },
      output: JSON.stringify({
        message: "Session updated successfully.",
        session: {
          id: sessionId,
          title: updated.title,
          agentID: updated.agentID,
          parentSessionID: updated.parentSessionID ?? null,
          sessionStatus: updated.sessionStatus,
        },
        changes,
      }),
    }
  },
})
