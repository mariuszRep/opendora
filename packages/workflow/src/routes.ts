/**
 * Workflow HTTP routes — Hono sub-app.
 * Mount via: app.route("/workflow", WorkflowRoutes())
 */

import { Hono } from "hono"
import { WorkflowStorage } from "./storage.ts"
import { Session } from "@opendora/session/session"
import { runWorkflow } from "./runner.ts"
import { Agent } from "@opendora/agent"

export function WorkflowRoutes() {
  const app = new Hono()

  app.get("/", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const workflows = await WorkflowStorage.list(directory)
    return c.json(workflows)
  })

  app.get("/:id", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")
    const workflow = await WorkflowStorage.get(directory, id)
    if (!workflow) return c.json({ error: `workflow "${id}" not found` }, 404)
    return c.json(workflow)
  })

  app.post("/", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: "invalid JSON" }, 400) }
    try {
      const workflow = await WorkflowStorage.create(directory, body)
      return c.json(workflow, 201)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("already exists")) return c.json({ error: msg }, 409)
      return c.json({ error: msg }, 400)
    }
  })

  app.put("/:id", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: "invalid JSON" }, 400) }
    try {
      const workflow = await WorkflowStorage.update(directory, id, body)
      return c.json(workflow)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  app.delete("/:id", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")
    try {
      await WorkflowStorage.remove(directory, id)
      return c.json(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 404)
    }
  })

  app.post("/:id/execute", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")

    const workflow = await WorkflowStorage.get(directory, id)
    if (!workflow) return c.json({ error: `workflow "${id}" not found` }, 404)

    let body: { agentId?: string; input?: Record<string, unknown>; parentSessionId?: string } = {}
    try { body = await c.req.json() } catch {}

    let agentId: string | undefined = body.agentId
    if (!agentId) {
      const agents = await Agent.list(directory)
      const candidate = agents.find(
        (a) => a.config.tools?.includes("workflow_run") && a.config.mode !== "system",
      )
      agentId = candidate?.id
    }

    if (!agentId) {
      return c.json({ error: "no agent found — pass agentId in the request body" }, 422)
    }

    const input = body.input ?? {}

    console.log(`[workflow execute] creating session with agentID=${agentId} body=${JSON.stringify(body)}`)
    const session = await Session.createNext({
      directory,
      title: `Workflow: ${workflow.name}`,
      sessionType: "worker",
      agentID: agentId,
      ownerKind: "workflow",
      ...(body.parentSessionId && { parentSessionID: body.parentSessionId }),
    })
    await Session.setCwd({ sessionID: session.id, cwd: directory })
    console.log(`[workflow execute] created session ${session.id} with session.agentID=${session.agentID}`)

    runWorkflow({ workflow, sessionId: session.id, input, directory }).catch((err) => {
      console.error(`[workflow execute] error in "${id}":`, err)
    })

    return c.json({ sessionId: session.id, workflowId: id, agentId }, 202)
  })

  return app
}
