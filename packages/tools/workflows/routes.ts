/**
 * Workflow HTTP routes — served as a Hono sub-app.
 *
 * Zero imports from packages/opencode. All dependencies are @opendora/* packages,
 * standard node modules, or hono. Mount via:
 *   app.route("/workflow", WorkflowRoutes())
 */

import { Hono } from "hono"
import fs from "fs/promises"
import path from "path"
import z from "zod"
import { Workflow } from "./schema"
import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
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
    } catch {
      // skip malformed files
    }
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

  // GET /workflow — list all workflows
  app.get("/", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const workflows = await listWorkflows(directory)
    return c.json(workflows)
  })

  // GET /workflow/:id — get single workflow
  app.get("/:id", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")
    const workflow = await readWorkflow(directory, id)
    if (!workflow) return c.json({ error: `workflow "${id}" not found` }, 404)
    return c.json(workflow)
  })

  // POST /workflow — create new workflow
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

  // PUT /workflow/:id — update workflow
  app.put("/:id", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ error: "invalid JSON" }, 400) }
    const parsed = Workflow.safeParse(body)
    if (!parsed.success) return c.json({ error: "invalid workflow schema", issues: parsed.error.issues }, 400)
    if (parsed.data.id !== id) return c.json({ error: "workflow id in body must match URL param" }, 400)
    await writeWorkflow(directory, parsed.data)
    return c.json(parsed.data)
  })

  // DELETE /workflow/:id — delete workflow
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

  // POST /workflow/:id/execute — run workflow via a new worker session
  app.post("/:id/execute", async (c) => {
    const directory = c.req.query("directory") ?? process.cwd()
    const id = c.req.param("id")

    const workflow = await readWorkflow(directory, id)
    if (!workflow) return c.json({ error: `workflow "${id}" not found` }, 404)

    let body: { agentId?: string; input?: Record<string, unknown> } = {}
    try { body = await c.req.json() } catch { /* allow empty body */ }

    // Resolve agent: use provided agentId or fall back to the first primary agent
    // that has workflow_load in its tools.
    let agentId: string | undefined = body.agentId

    if (!agentId) {
      const agents = await Agent.list(directory)
      const candidate = agents.find(
        (a) => a.config.tools?.includes("workflow_load") && a.config.mode !== "system",
      )
      if (!candidate) {
        return c.json({ error: "no agent with workflow_load tool found — assign it to an agent first" }, 422)
      }
      agentId = candidate.id
    }

    const input = body.input ?? {}
    const title = `Workflow: ${workflow.name}`

    const session = await Session.createNext({
      directory,
      title,
      sessionType: "worker",
      agentID: agentId,
      ownerKind: "service",
    })

    const inputArg = Object.keys(input).length > 0
      ? JSON.stringify(input)
      : "{}"

    const prompt = [
      `Execute workflow **${workflow.name}** (id: \`${id}\`).`,
      "",
      "Follow these steps exactly, in order:",
      "",
      `1. Call \`workflow_load\` with workflowId \`${id}\`.`,
      `2. Call \`workflow_create\` with:`,
      `   - workflowId: "${id}"`,
      `   - input: ${inputArg}   ← pass this as a JSON object, NOT as a string`,
      "3. Call `workflow_run_step` with the runId and cursor returned by workflow_create.",
      "4. For each step: execute it (load the skill if needed, produce output), then call `workflow_complete_step` with the output.",
      "5. Repeat step 3–4 until workflow_run_step returns status 'done'.",
      "6. Call `workflow_finish` with the runId, status 'success', and a brief summary.",
    ].join("\n")

    // Fire-and-forget — caller watches the session for updates
    SessionPrompt.prompt({
      sessionID: session.id,
      agent: agentId,
      noWait: true,
      parts: [{ type: "text", text: prompt }],
    }).catch(() => {})

    return c.json({ sessionId: session.id, workflowId: id, agentId }, 202)
  })

  return app
}
