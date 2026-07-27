import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { Identifier } from "@projectflows/util/id"

export interface AgentTarget {
  /** Stable agent id (folder-derived), baked into the tool id as agent__<id> */
  id: string
  /** Display name — same as id for this codebase's convention, but kept separate for clarity */
  name: string
  description?: string
}

/** opencode defaults to 1; we allow deeper legitimate chains (Plan -> Explore -> Verify -> ...) while still bounding runaway fan-out. */
const MAX_SPAWN_DEPTH = 8
/** Per-asker cap on concurrently outstanding async delegations, so a misbehaving loop can't fan out unboundedly. */
const MAX_CONCURRENT_PENDING = 10

const DEFAULT_RESULT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["done", "partial", "blocked"] },
    summary: { type: "string" },
    artifacts: { type: "array", items: { type: "string" } },
    open_questions: { type: "array", items: { type: "string" } },
  },
  required: ["status", "summary"],
}

const parameters = z.object({
  session_type: z
    .enum(["worker", "scope", "scratchpad", "role"])
    .describe("Type of new session to create. Overrides `retain` when set explicitly.")
    .optional(),
  retain: z
    .enum(["disposable", "conversational"])
    .describe(
      "'conversational' keeps the child as a durable scope session so it can field follow-up questions later " +
        "via session_message — use this whenever the task is exploratory or you expect to need clarification. " +
        "'disposable' uses a short-lived worker session for one-shot tasks. Defaults to 'conversational' for " +
        "async spawns and 'disposable' for sync ones.",
    )
    .optional(),
  title: z.string().describe("Human-readable session title.").optional(),
  prompt: z.string().describe("Message to send to start the session."),
  mode: z
    .enum(["sync", "async"])
    .describe(
      "'sync' blocks until the target agent replies inline. 'async' fires without blocking — you will be " +
        "automatically notified in this session when it finishes; do not poll or wait for it yourself. " +
        "Defaults to 'async' when reply_to is set, else 'sync'.",
    )
    .optional(),
  reply_to: z
    .string()
    .describe(
      "Routes the automatic completion notification to this session instead of the caller — use for " +
        "spawn-and-forward (a coordinator dispatching work whose results should land in a reporting session). " +
        "Optional; async delegations are notified back to the caller by default.",
    )
    .optional(),
  skills: z
    .array(z.string())
    .describe("Skill names to preload into the new session before the prompt is posted.")
    .optional(),
  result_schema: z
    .union([z.literal("default"), z.record(z.string(), z.unknown())])
    .describe(
      "Forces the child's final reply through structured output instead of leaving 'done' to be inferred from " +
        "prose. Pass 'default' for the built-in {status: done|partial|blocked, summary, artifacts?, " +
        "open_questions?} verdict schema, or your own JSON Schema object. Leave unset for conversational " +
        "children where prose is the point.",
    )
    .optional(),
})

/**
 * Builds a Tool.Info for a single delegation target agent — spawns a new session with this
 * agent and an initial prompt. No allowlist check inside execute() for WHICH agents can be
 * targeted — the tool's mere presence in the caller's available tools (granted implicitly by
 * LLM.filterToolsByAgent from the caller's "agent"-resource permission rules) IS that
 * authorization. See packages/session/src/llm.ts filterToolsByAgent and packages/runtime/src/agent.ts.
 *
 * Create-only: following up into an existing session (whether spawned by this tool or by a
 * workflow__<id> tool) goes through the generic session_message tool instead — neither
 * message nor reply actually need a baked-in target agent id, since the session's own stored
 * agentID already says who owns it. See registry/tools/sessions/src/session-message.ts.
 */
export function createAgentTargetTool(target: AgentTarget): Tool.Info {
  const description = [
    `Create a session with the "${target.name}" agent and send it an initial prompt.`,
    target.description ? `${target.name}: ${target.description}` : undefined,
    "",
    "To follow up into the resulting session later (or into any other session), use session_message instead " +
      "of spawning a new one and duplicating work.",
  ]
    .filter(Boolean)
    .join("\n")

  return Tool.define(`agent__${target.id}`, async () => ({
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      // Cast: the host-provided session service includes create/createNext at runtime
      // (packages/session/src/prompt.ts resolveTools wiring) but they predate the
      // HostServices.session type declaration — same widening used throughout.
      const sessionSvc = h.session as any
      if (!sessionSvc) throw new Error("session service not available")

      const promptFn = h.prompt
      if (!promptFn) throw new Error("prompt service not available")
      const resolvePromptParts = h.resolvePromptParts
      if (!resolvePromptParts) throw new Error("resolvePromptParts service not available")

      const replyToSessionID = params.reply_to
      const resolvedMode = params.mode ?? (replyToSessionID ? "async" : "sync")
      const wait = resolvedMode === "sync"

      if (!wait && h.delegation) {
        const pending = h.delegation.countPendingForAsker(ctx.sessionID)
        if (pending >= MAX_CONCURRENT_PENDING) {
          throw new Error(
            `Too many pending delegations from this session (${pending}/${MAX_CONCURRENT_PENDING}). ` +
              "Wait for one to complete before spawning more.",
          )
        }
      }

      const caller = await sessionSvc.get(ctx.sessionID)
      const spawnDepth = (caller?.spawnDepth ?? 0) + 1
      if (spawnDepth > MAX_SPAWN_DEPTH) {
        throw new Error(
          `Delegation depth limit reached (${MAX_SPAWN_DEPTH}). Do this work directly instead of spawning another agent.`,
        )
      }

      const retain = params.retain ?? (wait ? "disposable" : "conversational")
      const sessionType = params.session_type ?? (retain === "conversational" ? "scope" : "worker")
      const newSession = (await sessionSvc.createNext?.({
        title: params.title ?? `Task (@${target.id})`,
        sessionType,
        agentID: target.id,
        ownerID: ctx.agent,
        ownerKind: "agent",
        parentSessionID: ctx.sessionID,
        spawnDepth,
        ...(replyToSessionID ? { replyToSessionID } : {}),
      })) as any
      if (!newSession?.id) throw new Error("Failed to create session")
      const targetSessionId = newSession.id

      // Unlock this caller's own session_message tool in the child so it can reply/message
      // back even without a standing grant of its own (mirrors skill_load's per-session
      // tool-unlock mechanism). session_message is generic/non-per-target, so unlocking it
      // once here covers every future reply from this child, not just the return-path hint.
      if (h.skillTools?.add) {
        h.skillTools.add(targetSessionId, ["session_message"])
      }

      ctx.metadata({
        title: params.title ?? `Delegate → ${target.id}`,
        metadata: { sessionId: targetSessionId, agent: target.id, mode: resolvedMode, created: true, action: "create_session" },
      })

      const promptParts = (await resolvePromptParts(params.prompt)) as any[]

      if (params.skills?.length) {
        const skillSvc = h.skills
        if (skillSvc) {
          for (const skillName of params.skills) {
            const skill = await skillSvc.get(skillName)
            if (!skill) continue
            if (h.skillTools?.add && skill.tools?.length) {
              h.skillTools.add(targetSessionId, skill.tools)
            }
            const dir = skill.location.substring(0, skill.location.lastIndexOf("/"))
            promptParts.unshift({
              type: "text",
              text: [
                `<skill_content name="${skillName}">`,
                `# Skill: ${skill.name}`,
                "",
                skill.content.trim(),
                "",
                `Base directory for this skill: file://${dir}`,
                "</skill_content>",
              ].join("\n"),
              hidden: true,
            })
          }
        }
      }

      if (replyToSessionID) {
        promptParts.push({
          type: "text",
          text: [
            `Return path: ${replyToSessionID}`,
            "When you complete this task, use session_message (action: reply) to send results back.",
          ].join("\n"),
          hidden: true,
        })
      }

      const resultSchema = params.result_schema === "default" ? DEFAULT_RESULT_SCHEMA : params.result_schema
      const format = resultSchema ? { type: "json_schema" as const, schema: resultSchema } : undefined

      // Pre-generate the child's turn-starting message id so the delegation edge can be
      // recorded BEFORE the prompt is fired — otherwise an extremely fast (or errored) async
      // child could finish and attempt delivery before the edge existed to receive it.
      const childMessageID = Identifier.ascending("message")
      let edgeID: string | undefined
      if (h.delegation) {
        edgeID = h.delegation.record({
          askerSessionID: ctx.sessionID,
          askerMessageID: ctx.messageID,
          childSessionID: targetSessionId,
          childMessageID,
          agent: target.id,
          description: params.title ?? params.prompt,
          mode: resolvedMode,
          toolCallID: ctx.callID,
          resultSchema,
        })
      }

      // Only wired for sync calls: an async call's own tool execution returns almost
      // immediately (it doesn't block on the child), so there's no meaningful window for
      // the caller's abort to interrupt — the child keeps running by design either way.
      // For sync, we're blocked on the child's whole turn, so propagate the cancel down.
      const onAbort = () => {
        if (wait && h.promptCancel) h.promptCancel(targetSessionId)
      }
      if (wait) ctx.abort.addEventListener("abort", onAbort)

      let result: any
      try {
        result = (await promptFn({
          sessionID: targetSessionId,
          agent: target.id,
          messageID: childMessageID,
          noWait: !wait,
          parentMessageID: ctx.messageID,
          format,
          parts: promptParts,
        })) as any
      } finally {
        if (wait) ctx.abort.removeEventListener("abort", onAbort)
      }

      const text = result?.parts?.findLast?.((p: any) => p.type === "text")?.text ?? ""

      const sharedMeta = {
        sessionId: targetSessionId as string | undefined,
        agent: target.id,
        messageId: result?.info?.id,
        kind: "create_session" as string,
        mode: resolvedMode as string | undefined,
        created: true as boolean | undefined,
        action: "create_session" as string,
        data: undefined as Record<string, unknown> | undefined,
      }

      if (!wait) {
        // Async: nothing to finalize here — Delegation's three delivery layers (loop-end
        // callback, session.status bus backstop, boot reconcile) own the edge from here on.
        return {
          title: params.title ?? `Delegate → ${target.id}`,
          metadata: sharedMeta,
          output: [
            `session_id: ${targetSessionId}`,
            `agent: ${target.id}`,
            `mode: ${resolvedMode}`,
            `message_id: ${result?.info?.id}`,
            "status: message posted",
            "Do not wait or poll — you will be notified automatically when this finishes.",
          ].join("\n"),
        }
      }

      // Sync: the result is already in hand — finalize the edge inline (for graph history /
      // UI only) so the bus backstop never mistakes this for something still pending.
      if (edgeID && h.delegation) {
        h.delegation.finalizeSync(edgeID, { state: result?.info?.error ? "error" : "completed", result: text })
      }

      return {
        title: params.title ?? `Delegate → ${target.id}`,
        metadata: sharedMeta,
        output: [
          `session_id: ${targetSessionId}`,
          `agent: ${target.id}`,
          `mode: ${resolvedMode}`,
          "",
          `<spawn_result>`,
          text,
          `</spawn_result>`,
        ].join("\n"),
      }
    },
  }))
}
