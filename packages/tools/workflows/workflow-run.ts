import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { Session } from "@opendora/session/session"
import { Workflow } from "@opendora/workflow/schema"
import { runWorkflow } from "@opendora/workflow/runner"
import fs from "fs"
import path from "path"
import toolDef from "./workflow-run.json"

export const WorkflowRunTool = Tool.define("workflow_run", async () => {
  const parameters = z.object({
    workflowId: z.string().describe("ID of the workflow to run"),
    input: z
      .union([
        z.record(z.string(), z.unknown()),
        z.string().transform((v) => {
          try { return JSON.parse(v) as Record<string, unknown> } catch { return {} }
        }),
      ])
      .describe("Input values for the workflow's input node — pass as a JSON object, not a string"),
    agentId: z.string().optional().describe("Agent to use for the workflow session"),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      const directory = h.directory

      const workflowsDir = path.join(directory, ".opendora", "workflows")
      const workflowPath = path.join(workflowsDir, `${params.workflowId}.json`)

      let raw: unknown
      try {
        raw = JSON.parse(fs.readFileSync(workflowPath, "utf-8"))
      } catch {
        let available = "none"
        try {
          const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".json"))
          available = files.map((f) => f.replace(".json", "")).join(", ")
        } catch {}
        throw new Error(`Workflow "${params.workflowId}" not found. Available: ${available}`)
      }

      const workflow = Workflow.parse(raw)
      const input = params.input as Record<string, unknown>

      const agentId = params.agentId ?? ctx.agent ?? "engineer"
      const session = await Session.createNext({
        directory,
        title: `Workflow: ${workflow.name}`,
        sessionType: "worker",
        agentID: agentId,
        ownerKind: "service",
      })

      runWorkflow({ workflow, sessionId: session.id, input, directory }).catch((err) => {
        console.error(`[workflow_run] error in workflow "${params.workflowId}":`, err)
      })

      return {
        title: `Started workflow: ${workflow.name}`,
        output: [
          `Workflow "${workflow.name}" started.`,
          `Session: ${session.id}`,
          `Navigate to that session to follow execution in real time.`,
        ].join("\n"),
        metadata: { sessionId: session.id, workflowId: params.workflowId },
      }
    },
  }
})
