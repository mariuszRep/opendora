import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import DESCRIPTION from "./session-tree.txt"

const parameters = z.object({
  session_id: z.string().optional().describe("ID of the session to inspect. Defaults to the current session."),
})

function sessionNode(session: any, isTarget: boolean, children: any[]): any {
  return {
    id: session.id,
    title: session.title || null,
    type: session.sessionType ?? null,
    status: session.sessionStatus ?? null,
    agentId: session.agentID ?? null,
    isTarget: isTarget || undefined,
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
          metadata: { sessionId: targetId, found: false },
          output: JSON.stringify({ error: `Session '${targetId}' not found` }),
        }
      }

      // Walk up to find the true root
      const ancestors: any[] = []
      let cursor = target
      while (cursor.parentID) {
        const parent = await sessionSvc.get(cursor.parentID).catch(() => undefined)
        if (!parent) break
        ancestors.unshift(parent)
        cursor = parent
      }

      const treeRoot = ancestors.length > 0 ? ancestors[0] : target

      // Recursively build JSON tree
      async function buildNode(session: any): Promise<any> {
        const kids: any[] = await sessionSvc.children(session.id).catch(() => [])
        const children = await Promise.all(kids.map(buildNode))
        return sessionNode(session, session.id === targetId, children)
      }

      const tree = await buildNode(treeRoot)

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
        },
        output: JSON.stringify(result, null, 2),
      }
    } catch (error) {
      return {
        title: "Session Tree Failed",
        metadata: { sessionId: targetId, found: false },
        output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      }
    }
  },
})
