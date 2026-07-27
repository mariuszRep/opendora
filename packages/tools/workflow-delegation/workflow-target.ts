import z from "zod"
import { mkdirSync } from "fs"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"

export interface WorkflowTarget {
  /** Stable workflow id (folder-derived), baked into the tool id as workflow__<id> */
  id: string
  /** Display name — separate from id, since workflow names are free-text unlike agent names */
  name: string
  description?: string
  /** The workflow's declared Parameters node, if any — see packages/workflow's "parameters" nodeType. */
  parameters?: Array<{ name: string; type?: string; required?: boolean; description?: string; enum?: string[] }>
}

/**
 * Maps one declared workflow parameter to a real Zod field, matching proper MCP tool-schema
 * conventions (a typed, described inputSchema) instead of an opaque record — unlike the old
 * generic workflow_run, this tool is bound to one specific workflow at registration time, so
 * the schema can and should reflect that workflow's actual declared shape.
 */
function buildParamField(param: { type?: string; required?: boolean; description?: string; enum?: string[] }): z.ZodTypeAny {
  let base: z.ZodTypeAny
  if (param.enum && param.enum.length > 0) {
    base = z.enum(param.enum as [string, ...string[]])
  } else {
    switch (param.type) {
      case "number":
        base = z.number()
        break
      case "integer":
        base = z.number().int()
        break
      case "boolean":
        base = z.boolean()
        break
      case "object":
        base = z.record(z.string(), z.unknown())
        break
      case "array":
        base = z.array(z.unknown())
        break
      default:
        base = z.string()
    }
  }
  if (param.description) base = base.describe(param.description)
  return param.required ? base : base.optional()
}

/** Builds the `input` field's schema from a workflow's declared parameters, per-target. */
function buildInputSchema(declared: WorkflowTarget["parameters"]) {
  if (!declared?.length) {
    return z
      .record(z.string(), z.unknown())
      .optional()
      .default({})
      .describe("Input values keyed by parameter name. This workflow declares no parameters.")
  }
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const param of declared) {
    shape[param.name] = buildParamField(param)
  }
  return z.object(shape).describe("Input values for this workflow's declared parameters.")
}

/**
 * Builds a Tool.Info for a single delegation target workflow, mirroring
 * packages/tools/delegation/agent-target.ts's createAgentTargetTool: one
 * auto-registered tool per workflow (workflow__<id>) instead of one generic
 * workflow_run tool taking a free-form workflowId parameter. No in-execute
 * allow-list check — the tool's mere presence in the caller's available tools
 * (granted via the agent's "workflow"-resource permission rules, see
 * packages/runtime/src/agent.ts and configure-session-core.ts's enrichAgent)
 * IS the authorization, same as agent__<id>.
 *
 * workflow_run itself is untouched and keeps serving the workflow editor's
 * deterministic "Run Workflow" node (a dropdown-picked child workflow, not a
 * model tool call) — this tool is purely an additional, model-facing surface.
 */
export function createWorkflowTargetTool(target: WorkflowTarget): Tool.Info {
  const description = [
    `Run the "${target.name}" workflow.`,
    target.description ? `${target.name}: ${target.description}` : undefined,
  ]
    .filter(Boolean)
    .join("\n")

  const parameters = z.object({
    input: buildInputSchema(target.parameters),
    agentId: z.string().optional().describe("Agent to use for the workflow session"),
    workdir: z
      .string()
      .optional()
      .describe("Working directory for all bash nodes in the workflow. Defaults to the calling session directory."),
    wait: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, block until the workflow completes and return its summary. Default: false (fire and forget)."),
  })

  return Tool.define(`workflow__${target.id}`, async () => ({
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      const workflowSvc = h.workflow
      // Cast: predates the HostServices.session type declaration for createNext/setCwd,
      // same widening agent-target.ts uses.
      const sessionSvc = h.session as any

      if (!workflowSvc) throw new Error("workflow service not available in this context")
      if (!sessionSvc?.createNext) throw new Error("session.createNext not available in this context")
      if (!sessionSvc?.setCwd) throw new Error("session.setCwd not available in this context")

      const workdir = params.workdir ?? h.directory ?? h.worktree
      if (params.workdir) mkdirSync(params.workdir, { recursive: true })

      const workflow = await workflowSvc.get(target.id)
      if (!workflow) {
        throw new Error(`Workflow "${target.id}" not found. It may have been deleted since this tool was granted.`)
      }

      const input = params.input as Record<string, unknown>
      const validationError = (message: string) => {
        const error = new Error(message)
        error.name = "WorkflowValidationError"
        return error
      }

      const wf = workflow as any

      // Resolve agent name to storage ID via host agents service.
      let agentId: string
      const agentInput = params.agentId ?? ctx.agent ?? "engineer"
      const agentsSvc = h.agents as any
      if (agentsSvc) {
        const allAgents = (await agentsSvc.list()) as any[]
        const lookedUp = allAgents.find((a: any) => a.name === agentInput || a.id === agentInput)
        agentId = lookedUp?.id ?? agentInput
      } else {
        agentId = agentInput
      }

      const session = (await sessionSvc.createNext({
        directory: workdir,
        title: `Workflow: ${wf.name ?? target.id}`,
        sessionType: "worker",
        agentID: agentId,
        ownerKind: "workflow",
        parentSessionID: ctx.sessionID,
      })) as { id: string }
      await sessionSvc.setCwd({ sessionID: session.id, cwd: workdir })

      // Surface the session link immediately — before the (possibly long, for wait:true)
      // run itself — instead of only in the final return value. Matches agent-target.ts's
      // and session_message's existing early ctx.metadata() calls.
      ctx.metadata({
        title: `Workflow: ${wf.name ?? target.id}`,
        metadata: {
          sessionId: session.id,
          workflowId: target.id,
          workflowName: wf.name,
          mode: (params.wait ? "sync" : "async") as "sync" | "async",
        },
      })

      if (params.wait) {
        const detailed = await workflowSvc.runDetailed(workflow, session.id, input, workdir)

        // A failed child must not surface as a successful tool result — see
        // workflow-run.ts's identical comment for why this rethrow matters for
        // parent-workflow error propagation.
        const status = detailed.outputObject.status
        if (status.completed === false) {
          const message = `Workflow "${wf.name ?? target.id}" failed: ${status.error ?? "unknown error"}`
          throw status.errorType === "validation" ? validationError(message) : new Error(message)
        }

        return {
          title: `Workflow: ${wf.name ?? target.id}`,
          output: detailed.display,
          metadata: { sessionId: session.id, workflowId: target.id, workflowName: wf.name, mode: "sync" as "sync" | "async" },
          outputObject: detailed.outputObject,
        }
      }

      workflowSvc.run(workflow, session.id, input, workdir).catch((err: any) => {
        console.error(`[workflow__${target.id}] error:`, err)
      })

      return {
        title: `Workflow started: ${wf.name ?? target.id}`,
        output: `Workflow "${wf.name ?? target.id}" started.\nSession: ${session.id}`,
        metadata: { sessionId: session.id, workflowId: target.id, workflowName: wf.name, mode: "async" as "sync" | "async" },
      }
    },
  }))
}
