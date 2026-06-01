import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { Session } from "@opendora/session/session"
import { WorkflowStorage } from "@opendora/workflow/storage"
import { runWorkflow } from "@opendora/workflow/runner"
import toolDef from "./workflow-run.json"

export const WorkflowRunTool = Tool.define("workflow_run", async (initCtx) => {
  const agentWorkflows = initCtx?.agent?.workflows

  const description = agentWorkflows && agentWorkflows.length > 0
    ? `${toolDef.description}\n\nWorkflows assigned to this agent (workflowId must be one of these):\n${agentWorkflows.map((id) => `- ${id}`).join("\n")}`
    : toolDef.description

  const parameters = z.object({
    workflowId: z.string().describe("ID of the workflow to run"),
    input: z
      .union([
        z.record(z.string(), z.unknown()),
        z.string().transform((v) => {
          try { return JSON.parse(v) as Record<string, unknown> } catch { return {} }
        }),
      ])
      .optional()
      .default({})
      .describe(
        "Input values keyed by parameter name. Call workflow_parameters first to discover required keys, then populate this object with all required parameters.",
      ),
    agentId: z.string().optional().describe("Agent to use for the workflow session"),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      const directory = h.worktree

      // If the agent has workflows assigned, restrict workflow_run to that list.
      // Mirrors the skill_load assignment-as-permission pattern.
      if (agentWorkflows && agentWorkflows.length > 0 && !agentWorkflows.includes(params.workflowId)) {
        throw new Error(
          `Workflow "${params.workflowId}" is not assigned to this agent. Assigned workflows: ${agentWorkflows.join(", ")}`,
        )
      }

      const workflow = await WorkflowStorage.get(directory, params.workflowId)
      if (!workflow) {
        const available = (await WorkflowStorage.availableIds(directory)).join(", ") || "none"
        throw new Error(`Workflow "${params.workflowId}" not found. Available: ${available}`)
      }

      const input = params.input as Record<string, unknown>

      // Throw early if required params are missing — agent should call workflow_parameters first.
      const paramNode = workflow.nodes.find((n) => (n.data as any)?.nodeType === "parameters")
      const declaredParams: Array<{ name: string; type?: string; required?: boolean; description?: string; enum?: string[] }> =
        (paramNode?.data as any)?.workflowParameters ?? []
      const missingRequired = declaredParams.filter((p) => p.required && !(p.name in input))
      if (missingRequired.length > 0) {
        throw new Error(
          `Workflow "${params.workflowId}" is missing required parameters: ${missingRequired.map((p) => p.name).join(", ")}. Call workflow_parameters first to see the full parameter spec.`,
        )
      }

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
