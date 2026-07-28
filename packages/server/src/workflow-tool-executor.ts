import type { z } from "zod"
import { tool as aiTool, jsonSchema } from "ai"
import { Session } from "@projectflows/session/session"
import { SessionPrompt } from "@projectflows/session/prompt"
import { Delegation } from "@projectflows/session/delegation"
import { SessionStatus } from "@projectflows/session/status"
import { Agent } from "@projectflows/runtime/agent"
import { Instance } from "@projectflows/runtime/instance"
import { Question } from "@projectflows/runtime/question"
import { Skill } from "@projectflows/skills/skill"
import { Identifier } from "@projectflows/util/id"
import { ToolRegistry } from "@projectflows/server/tool-registry"
import { addSkillTools, getSkillTools } from "@projectflows/session/skill-tools"
import type { ToolExecutor } from "@projectflows/workflow/executor"
import { WorkflowStorage } from "@projectflows/workflow/storage"
import { runWorkflowDetailed, WorkflowValidationError } from "@projectflows/workflow/runner"
import { describeCtxManifest } from "@projectflows/workflow/refs"
import { createWorkflowTargetTool } from "@projectflows/tools/workflow-delegation/workflow-target"
import { mergeArgs, formatValidationFeedback, toJsonSchema } from "./workflow-tool-fill"

/**
 * Registers the workflow → tool bridge. Nodes without agentArgs execute the
 * tool directly from resolved fixed parameters (no model call). Nodes with
 * agentArgs are driven as a real, forced single-tool agent turn
 * (SessionPrompt.promptWithExtraTools) — the same runtime tool definition,
 * schema, and validator a direct tool call uses — so the agent constructs
 * the dynamic fields with full workflow context, fixed args stay
 * authoritative, and the complete merged object is validated before the
 * tool's real execute() ever runs.
 */
export function createWorkflowToolExecutor(): ToolExecutor {
  return async (toolId, fixedArgs, agentArgs, ctx) => {
    await ToolRegistry.init()
    let toolInfo = ToolRegistry.all().find((t) => t.id === toolId)

    // workflow__<id> tools are normally registered by reconcileWorkflowTools() during a
    // live agent turn, gated on that agent's own workflows[] grant — but a RunWorkflow
    // node's target is chosen by the workflow author at design time, independent of any
    // agent's grants, so it isn't guaranteed to be registered yet. Force-register it here
    // on demand, mirroring reconcileWorkflowTools()'s own parameter-extraction logic.
    if (!toolInfo && toolId.startsWith("workflow__")) {
      const targetId = toolId.slice("workflow__".length)
      const lookupDirectory = ctx.directory
        ?? await Session.effectiveDefaultPath(ctx.sessionID).catch(() => Instance.directory)
      const wf = await WorkflowStorage.get(lookupDirectory, targetId)
      if (wf) {
        const paramNode = (wf.nodes ?? []).find((n: any) => (n.data as any)?.nodeType === "parameters")
        const parameters = ((paramNode?.data as any)?.workflowParameters ?? []) as Array<{
          name: string
          type?: string
          required?: boolean
          description?: string
          enum?: string[]
        }>
        ToolRegistry.register(
          createWorkflowTargetTool({ id: wf.id, name: wf.name, description: wf.description, parameters }),
          "workflow-delegation",
        )
        toolInfo = ToolRegistry.all().find((t) => t.id === toolId)
      }
    }

    if (!toolInfo) throw new Error(`Tool "${toolId}" not found in registry`)

    const initCtx = {
      model: ctx.model ?? { providerID: "fallback", modelID: "fallback" },
    }
    const toolDef = await toolInfo.init(initCtx)

    const sessionDirectory = ctx.directory
      ?? await Session.effectiveDefaultPath(ctx.sessionID).catch(() => Instance.directory)

    const buildExecCtx = (currentArgs: () => Record<string, unknown>, callID?: string) => ({
      sessionID: ctx.sessionID,
      messageID: ctx.messageID ?? Identifier.ascending("message"),
      agent: ctx.agent ?? "",
      callID,
      abort: ctx.abort ?? new AbortController().signal,
      messages: [],
      metadata: async (input: { title?: string; metadata?: unknown }) => {
        if (ctx.partID && ctx.messageID) {
          await Session.updatePart({
            id: ctx.partID,
            sessionID: ctx.sessionID,
            messageID: ctx.messageID,
            type: "tool",
            callID: ctx.partID,
            tool: toolId,
            state: {
              status: "running",
              input: currentArgs(),
              metadata: input.metadata as any,
              time: { start: Date.now() },
            },
          } as any)
        }
      },
      ask: async (_input: unknown) => {},
      extra: {
        directory: sessionDirectory,
        worktree: Instance.worktree,
        skillTools: {
          get: (sid: string) => getSkillTools(sid),
          add: (sid: string, toolIds: string[]) => addSkillTools(sid, toolIds),
        },
        question: (params: { sessionID: string; questions: unknown[]; tool?: { messageID: string; callID: string } }) =>
          Question.ask({
            sessionID: params.sessionID,
            questions: params.questions as Question.Info[],
            tool: params.tool,
          }),
        skills: {
          all: () => Skill.all(),
          get: (name: string) => Skill.get(name),
          save: (location: string, content: string) => Skill.save(location, content),
          saveConfig: (name: string, patch: { tools?: string[] }) => Skill.saveConfig(name, patch),
        },
        agents: {
          list: () => Agent.list(),
          get: (id: string) => Agent.get(id),
        },
        workflow: {
          get: (id: string) => WorkflowStorage.get(sessionDirectory, id),
          availableIds: () => WorkflowStorage.availableIds(sessionDirectory),
          runDetailed: (workflow: any, sessionId: string, input: Record<string, unknown>, directory: string) =>
            runWorkflowDetailed({ workflow, sessionId, input, directory }),
          run: async (workflow: any, sessionId: string, input: Record<string, unknown>, directory: string) =>
            (await runWorkflowDetailed({ workflow, sessionId, input, directory })).display,
          sandboxRun: (workflow: any, sessionId: string, input: Record<string, unknown>, directory: string, seedCtx?: Record<string, unknown>) =>
            runWorkflowDetailed({ workflow, sessionId, input, directory, seedCtx, sandbox: true }),
        },
        prompt: (opts: any) => SessionPrompt.prompt(opts),
        resolvePromptParts: (template: string) => SessionPrompt.resolvePromptParts(template),
        session: {
          list: (filter?: any) => Session.list(filter),
          get: (id: string) => Session.get(id),
          messages: (id: string) => Session.messages({ sessionID: id }),
          setTitle: (id: string, title: string) => Session.setTitle({ sessionID: id, title }),
          create: (input: any) => Session.create(input),
          createNext: (input: any) => Session.createNext(input),
          setCwd: (input: { sessionID: string; cwd: string }) => Session.setCwd(input),
          ensureMainSession: (agentID: string) => Session.ensureMainSession(agentID),
          setReplyToSessionID: (input: any) => Session.setReplyToSessionID(input),
          getStatus: async (sessionId: string) => SessionStatus.get(sessionId),
        },
        delegation: {
          record: (input: any) => Delegation.record(input),
          finalizeSync: (edgeID: string, input: any) => Delegation.finalizeSync(edgeID, input),
          countPendingForAsker: (askerSessionID: string) => Delegation.countPendingForAsker(askerSessionID),
        },
        promptCancel: (sessionID: string) => SessionPrompt.cancel(sessionID, { cascade: true }),
      },
    })

    if (agentArgs.length === 0) {
      const parsedFixed = toolDef.parameters.safeParse(fixedArgs)
      if (!parsedFixed.success) {
        const nodeLabel = ctx.workflowMeta?.nodeLabel ?? toolId
        const issues = parsedFixed.error.issues
          .map((i) => `"${i.path.join(".")}" ${i.message}`)
          .join(", ")
        throw new WorkflowValidationError(
          `Tool node "${nodeLabel}" (action_id "${toolId}") parameters are invalid: ${issues}.`
        )
      }
      const execCtx = buildExecCtx(() => fixedArgs)
      const result = await toolDef.execute(fixedArgs, execCtx)
      return { output: result.output, metadata: result.metadata, finalArgs: fixedArgs, outputObject: (result as any).outputObject }
    }

    // Build the fill prompt: tool identity/instructions, prior workflow output,
    // fixed args framed as authoritative, and the specific fields to derive.
    const fixedDesc = Object.entries(fixedArgs)
      .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
      .join("\n")
    // This fill turn runs in the shared workflow session, so the prior steps' outputs are already
    // in history — inject only a compact key manifest, not the full serialized values, to avoid
    // duplicating that context.
    const workflowContext = ctx.workflowContext as Record<string, unknown> | undefined
    const contextDesc = workflowContext && Object.keys(workflowContext).length > 0
      ? describeCtxManifest(workflowContext)
      : ""
    const basePrompt = [
      ctx.instructions ? ctx.instructions : `Call the tool \`${toolId}\` now.`,
      contextDesc ? `Workflow context from prior steps:\n${contextDesc}` : "",
      fixedArgs && Object.keys(fixedArgs).length > 0
        ? `The following parameters are already decided — the tool call must use them exactly:\n${fixedDesc}`
        : "",
      `You must determine the value(s) for: ${agentArgs.join(", ")}`,
      `Use the tool immediately.`,
    ].filter(Boolean).join("\n\n")

    const toolSchemaJson = toJsonSchema(toolDef.parameters)

    let attempts = 0
    let terminalError: Error | undefined
    let lastInvalid: { message: string; error: z.ZodError } | undefined
    let capturedFinalArgs: Record<string, unknown> | undefined
    let capturedResult: { title: string; output: string; metadata: unknown; outputObject?: unknown } | undefined

    const toolForModel = aiTool({
      description: toolDef.description,
      inputSchema: jsonSchema(toolSchemaJson as any),
      async execute(agentProvidedArgs: any, options: any) {
        attempts++
        const merged = mergeArgs(agentProvidedArgs ?? {}, fixedArgs)
        const parsed = toolDef.parameters.safeParse(merged)

        if (!parsed.success) {
          const message = formatValidationFeedback(toolId, toolDef, parsed.error, merged)
          lastInvalid = { message, error: parsed.error }
          // Bounded to two total fill attempts: stop the loop after the second invalid result.
          if (attempts >= 2) {
            SessionPrompt.markExtraToolsDone(ctx.sessionID)
            terminalError = new Error(message, { cause: parsed.error })
          }
          throw new Error(message, { cause: parsed.error })
        }

        SessionPrompt.markExtraToolsDone(ctx.sessionID)
        const execCtx = buildExecCtx(() => merged, options?.toolCallId)
        const result = await toolDef.execute(merged, execCtx)
        capturedFinalArgs = merged
        capturedResult = result
        return result
      },
    })

    await SessionPrompt.promptWithExtraTools(
      {
        sessionID: ctx.sessionID,
        model: ctx.model,
        agent: ctx.agent,
        hidden: true,
        parts: [{ type: "text", text: basePrompt }],
      },
      { [toolId]: toolForModel },
      ctx.workflowMeta,
    )

    if (terminalError) throw terminalError
    if (!capturedResult || !capturedFinalArgs) {
      if (lastInvalid) throw new Error(lastInvalid.message, { cause: lastInvalid.error })
      throw new Error(
        `Tool \`${toolId}\` was not called while synthesizing arguments for: ${agentArgs.join(", ")}.`,
      )
    }

    return {
      output: capturedResult.output,
      metadata: capturedResult.metadata as Record<string, unknown> | undefined,
      finalArgs: capturedFinalArgs,
      outputObject: capturedResult.outputObject,
    }
  }
}
