import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { resolveReferences, findNodeById } from "./schema.ts"
import { getRunStore } from "./run-store.ts"
import toolDef from "./workflow-run-step.json"

export const WorkflowRunStepTool = Tool.define("workflow_run_step", async () => {
  const parameters = z.object({
    runId: z.string().describe("The run identifier returned by workflow_create."),
    stepId: z.string().optional().describe("Optional. Run a specific step instead of the current cursor."),
    inputOverride: z.record(z.unknown()).optional().describe("Optional. Override the step's resolved input for this invocation only."),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      const sessionSvc = h.session as any
      if (!sessionSvc) throw new Error("session service not available")
      const promptFn = h.prompt as any
      if (!promptFn) throw new Error("prompt service not available")
      const skillSvc = h.skills as any
      if (!skillSvc) throw new Error("skills service not available")

      const store = getRunStore()
      const entry = store.get(params.runId)
      if (!entry) throw new Error(`Run not found: ${params.runId}`)

      const { run, workflow } = entry
      const stepId = params.stepId ?? run.cursor
      const node = findNodeById(workflow.root, stepId)
      if (!node) throw new Error(`Step "${stepId}" not found in workflow tree`)

      if (node.kind !== "task" && node.kind !== "decide") {
        throw new Error(`Step "${stepId}" is a "${node.kind}" node — only task and decide steps can be executed directly`)
      }

      // Resolve input references
      const rawInput = params.inputOverride ?? node.input ?? {}
      const resolvedInput = resolveReferences(rawInput, run.input, run.ctx) as Record<string, unknown>

      // Load the skill
      const skill = await skillSvc.get(node.skill)
      if (!skill) {
        const all = await skillSvc.all()
        const available = all.map((s: any) => s.name).join(", ")
        throw new Error(`Skill "${node.skill}" not found. Available: ${available || "none"}`)
      }

      // Create step sub-session
      const subSession = await sessionSvc.create({
        title: `[${workflow.name}] ${node.kind}: ${node.skill}`,
        sessionType: "worker",
        agentID: ctx.agent,
        ownerID: ctx.agent,
        ownerKind: "agent",
        parentSessionID: ctx.sessionID,
      })

      // Build prompt with skill content
      const promptParts: any[] = [
        {
          type: "text",
          text: [
            `<skill_content name="${node.skill}">`,
            `# Skill: ${skill.name}`,
            "",
            skill.content.trim(),
            "</skill_content>",
          ].join("\n"),
          hidden: true,
        },
        {
          type: "text",
          text: [
            `Task: ${node.kind === "task" ? "Execute the following task using the skill above." : "Make a decision based on the input and skill above. Return ONLY a branch label."}`,
            "",
            "Input:",
            JSON.stringify(resolvedInput, null, 2),
            "",
            node.kind === "decide"
              ? `Available branches: ${Object.keys(node.branches).join(", ")}\nReturn ONLY the branch label as plain text — no JSON, no markdown.`
              : "Return your result. If the skill expects structured output, return valid JSON.",
          ].join("\n"),
        },
      ]

      const result = await promptFn({
        sessionID: subSession.id,
        agent: ctx.agent,
        noWait: false,
        parentMessageID: ctx.messageID,
        parts: promptParts,
      })

      const text = result.parts.findLast((part: any) => part.type === "text")?.text ?? ""

      // Record in history
      run.history.push({
        tool: "workflow_run_step",
        args: params as Record<string, unknown>,
        result: { stepId, output: text, subSessionId: subSession.id },
        at: Date.now(),
      })

      return {
        title: `Ran step: ${stepId} (${node.skill})`,
        output: [
          `stepId: ${stepId}`,
          `kind: ${node.kind}`,
          `skill: ${node.skill}`,
          `subSessionId: ${subSession.id}`,
          "",
          `<step_output>`,
          text,
          `</step_output>`,
        ].join("\n"),
        metadata: {
          runId: params.runId,
          stepId,
          subSessionId: subSession.id,
          kind: node.kind,
        },
      }
    },
  }
})
