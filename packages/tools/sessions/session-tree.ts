import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import DESCRIPTION from "./session-tree.txt"

const parameters = z.object({
  session_id: z.string().optional().describe("ID of the session to inspect. Defaults to the current session."),
  include_stats: z.boolean().default(false).describe("Include per-node statistics: message count and tool call count."),
})

function sessionNode(session: any, isTarget: boolean, children: any[], stats?: { messageCount: number; toolCallCount: number }): any {
  return {
    id: session.id,
    title: session.title || null,
    type: session.sessionType ?? null,
    status: session.sessionStatus ?? null,
    agentId: session.agentID ?? null,
    isTarget: isTarget || undefined,
    ...(stats !== undefined ? { stats } : {}),
    children,
  }
}

export const SessionTreeTool = Tool.define("session_tree", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const h = host(ctx)
    const sessionSvc = h.session as any
    if (!sessionSvc) throw new Error("session service not available")

    await ctx.ask({
      permission: "session_get",
      patterns: [],
      always: ["*"],
      metadata: { sessionId: params.session_id ?? ctx.sessionID }
    })

    const targetId = params.session_id ?? ctx.sessionID

    try {
      const target = await sessionSvc.get(targetId)
      if (!target) {
        return {
          title: "Session Not Found",
          metadata: { sessionId: targetId, found: false } as any,
          output: JSON.stringify({ error: `Session '${targetId}' not found` }),
        }
      }

      // Walk up to find the true root
      const ancestors: any[] = []
      let cursor = target
      while (cursor.parentSessionID) {
        const parent = await sessionSvc.get(cursor.parentSessionID).catch(() => undefined)
        if (!parent) break
        ancestors.unshift(parent)
        cursor = parent
      }

      const treeRoot = ancestors.length > 0 ? ancestors[0] : target

      // Compute stats for a session node if requested
      async function getStats(session: any): Promise<{ messageCount: number; toolCallCount: number } | undefined> {
        if (!params.include_stats) return undefined
        try {
          const msgs: any[] = await sessionSvc.messages({ sessionID: session.id }).catch(() => [])
          const toolCallCount = msgs.reduce((sum: number, msg: any) => {
            const parts: any[] = msg.parts || []
            return sum + parts.filter((p: any) => p.type === "tool").length
          }, 0)
          return { messageCount: msgs.length, toolCallCount }
        } catch {
          return { messageCount: 0, toolCallCount: 0 }
        }
      }

      // Recursively build JSON tree
      const MAX_DEPTH = 10
      async function buildNode(session: any, depth: number = 0): Promise<any> {
        const stats = await getStats(session)
        if (depth >= MAX_DEPTH) {
          return sessionNode(session, session.id === targetId, [], stats)
        }
        const kids: any[] = await sessionSvc.children(session.id).catch(() => [])
        const children = await Promise.all(kids.map((kid: any) => buildNode(kid, depth + 1)))
        return sessionNode(session, session.id === targetId, children, stats)
      }

      const tree = await buildNode(treeRoot, 0)

      const path = [...ancestors.map((s: any) => s.id), targetId]

      const result = {
        target: targetId,
        depth: ancestors.length,
        path,
        tree,
      }

      return {
        title: `Session Tree: ${target.title || targetId}`,
        metadata: {
          sessionId: targetId,
          treeRootId: treeRoot.id,
          depth: ancestors.length,
          found: true,
        } as any,
        output: JSON.stringify(result, null, 2),
      }
    } catch (error) {
      return {
        title: "Session Tree Failed",
        metadata: { sessionId: targetId, found: false } as any,
        output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      }
    }
  },
})
