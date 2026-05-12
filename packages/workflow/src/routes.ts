/**
 * Workflow HTTP routes — Hono sub-app.
 * Mount via: app.route("/workflow", WorkflowRoutes())
 */

import { Hono } from "hono"
import fs from "fs/promises"
import path from "path"
import { Workflow } from "./schema.ts"
import { Session } from "@opendora/session/session"
import { runWorkflow } from "./runner.ts"
import { Agent } from "@opendora/agent"

function workflowsDir(directory: string): string {
  return path.join(directory, ".opendora", "workflows")
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function listWorkflows(directory: string): Promise<Workflow[]> {
  const dir = workflowsDir(directory)
  await ensureDir(dir)
  const entries = await fs.readdir(dir).catch(() => [] as string[])
  const workflows: Workflow[] = []
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir, entry), "utf8"))
      const parsed = Workflow.safeParse(raw)
      if (parsed.success) workflows.push(parsed.data)
    } catch {}
  }
  return workflows
}

async function readWorkflow(directory: string, id: string): Promise<Workflow | null> {
  const file = path.join(workflowsDir(directory), `${id}.json`)
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8"))
    const parsed = Workflow.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function writeWorkflow(directory: string, workflow: Workflow): Promise<void> {
  const dir = workflowsDir(directory)
  await ensureDir(dir)
  await fs.writeFile(
    path.join(dir, `${workflow.id}.json`),
    JSON.stringify(workflow, null, 2),
    "utf8",
  )
}

export function WorkflowRoutes() {
  const app = new Hono()

  app.get("/", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const workflows = await listWorkflows(directory)
    return c.json(workflows)
  })

  app.get("/:id", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")
    const workflow = await readWorkflow(directory, id)
    if (!workflow) return c.json({ error: `workflow "${id}" not found` }, 404)
    return c.json(workflow)
  })

  app.post("/", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: "invalid JSON" }, 400) }
    const parsed = Workflow.safeParse(body)
    if (!parsed.success) return c.json({ error: "invalid workflow schema", issues: parsed.error.issues }, 400)
    const existing = await readWorkflow(directory, parsed.data.id)
    if (existing) return c.json({ error: `workflow "${parsed.data.id}" already exists` }, 409)
    await writeWorkflow(directory, parsed.data)
    return c.json(parsed.data, 201)
  })

  app.put("/:id", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: "invalid JSON" }, 400) }
    const parsed = Workflow.safeParse(body)
    if (!parsed.success) return c.json({ error: "invalid workflow schema", issues: parsed.error.issues }, 400)
    if (parsed.data.id !== id) return c.json({ error: "workflow id must match URL" }, 400)
    await writeWorkflow(directory, parsed.data)
    return c.json(parsed.data)
  })

  app.delete("/:id", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")
    const file = path.join(workflowsDir(directory), `${id}.json`)
    try {
      await fs.unlink(file)
      return c.json(true)
    } catch {
      return c.json({ error: `workflow "${id}" not found` }, 404)
    }
  })

  app.post("/:id/execute", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")

    const workflow = await readWorkflow(directory, id)
    if (!workflow) return c.json({ error: `workflow "${id}" not found` }, 404)

    let body: { agentId?: string; input?: Record<string, unknown> } = {}
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

    const session = await Session.createNext({
      directory,
      title: `Workflow: ${workflow.name}`,
      sessionType: "worker",
      agentID: agentId,
      ownerKind: "service",
    })

    runWorkflow({ workflow, sessionId: session.id, input, directory }).catch((err) => {
      console.error(`[workflow execute] error in "${id}":`, err)
    })

    return c.json({ sessionId: session.id, workflowId: id, agentId }, 202)
  })

  return app
}
