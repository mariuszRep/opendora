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

const parameters = z
  .object({
    action: z
      .enum(["create_session", "message_session", "reply_session"])
      .describe(
        "create_session: start a new session with the target agent and an initial message. " +
          "message_session: post into an existing session of the target agent and trigger its response — " +
          "use this for follow-up questions into a session you (or another agent) already spawned, instead " +
          "of spawning a new one and duplicating work. " +
          "reply_session: post a message into an existing session as an ingest — does NOT trigger a new turn.",
      ),
    session_id: z
      .string()
      .describe("Existing session ID. Required for message_session and reply_session. Ignored for create_session.")
      .optional(),
    session_type: z
      .enum(["worker", "scope", "scratchpad", "role"])
      .describe(
        "Type of new session to create. Only used by create_session. Overrides `retain` when set explicitly.",
      )
      .optional(),
    retain: z
      .enum(["disposable", "conversational"])
      .describe(
        "create_session only. 'conversational' keeps the child as a durable scope session so it can field " +
          "follow-up questions later via message_session — use this whenever the task is exploratory or you " +
          "expect to need clarification. 'disposable' uses a short-lived worker session for one-shot tasks. " +
          "Defaults to 'conversational' for async spawns and 'disposable' for sync ones.",
      )
      .optional(),
    title: z.string().describe("Human-readable session title. Only used by create_session.").optional(),
    prompt: z
      .string()
      .describe("Message to send. Required for create_session and message_session.")
      .optional(),
    message: z.string().describe("Text content to post. Required for reply_session.").optional(),
    data: z
      .record(z.string(), z.unknown())
      .describe("Optional structured JSON payload appended to a reply_session message.")
      .optional(),
    mode: z
      .enum(["sync", "async"])
      .describe(
        "create_session/message_session only. 'sync' blocks until the target agent replies inline. " +
          "'async' fires without blocking — you will be automatically notified in this session when it " +
          "finishes; do not poll or wait for it yourself. Defaults to 'async' when reply_to is set, else 'sync'.",
      )
      .optional(),
    reply_to: z
      .string()
      .describe(
        "create_session/message_session only. Routes the automatic completion notification to this session " +
          "instead of the caller — use for spawn-and-forward (a coordinator dispatching work whose results " +
          "should land in a reporting session). Optional; async delegations are notified back to the caller " +
          "by default.",
      )
      .optional(),
    skills: z
      .array(z.string())
      .describe("create_session only. Skill names to preload into the new session before the prompt is posted.")
      .optional(),
    result_schema: z
      .union([z.literal("default"), z.record(z.string(), z.unknown())])
      .describe(
        "create_session/message_session only. Forces the child's final reply through structured output " +
          "instead of leaving 'done' to be inferred from prose. Pass 'default' for the built-in " +
          "{status: done|partial|blocked, summary, artifacts?, open_questions?} verdict schema, or your own " +
          "JSON Schema object. Leave unset for conversational children where prose is the point.",
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "create_session" && !value.prompt) {
      ctx.addIssue({ code: "custom", path: ["prompt"], message: "prompt is required for create_session" })
    }
    if (value.action === "message_session") {
      if (!value.session_id) {
        ctx.addIssue({ code: "custom", path: ["session_id"], message: "session_id is required for message_session" })
      }
      if (!value.prompt) {
        ctx.addIssue({ code: "custom", path: ["prompt"], message: "prompt is required for message_session" })
      }
    }
    if (value.action === "reply_session") {
      if (!value.session_id) {
        ctx.addIssue({ code: "custom", path: ["session_id"], message: "session_id is required for reply_session" })
      }
      if (!value.message) {
        ctx.addIssue({ code: "custom", path: ["message"], message: "message is required for reply_session" })
      }
    }
  })

/** Pure — no I/O. deny wins; an empty allow list means "all allowed". */
function evaluateSendPolicy(policy: { allow?: string[]; deny?: string[] } | null | undefined, actorID: string): "allow" | "deny" {
  if (!policy) return "allow"
  if (policy.deny?.includes(actorID)) return "deny"
  if (policy.allow && policy.allow.length > 0 && !policy.allow.includes(actorID)) return "deny"
  return "allow"
}

/** Ancestor walk to the root session — same technique session_tree uses to find the true root. */
async function findRoot(sessionSvc: any, sessionID: string): Promise<string> {
  const seen = new Set<string>([sessionID])
  let cursor = await sessionSvc.get(sessionID).catch(() => undefined)
  let rootID = sessionID
  while (cursor?.parentSessionID && !seen.has(cursor.parentSessionID)) {
    seen.add(cursor.parentSessionID)
    rootID = cursor.parentSessionID
    cursor = await sessionSvc.get(cursor.parentSessionID).catch(() => undefined)
  }
  return rootID
}

/**
 * Builds a Tool.Info for a single delegation target agent, covering the 3 interaction modes
 * (create_session / message_session / reply_session) via an `action` param instead of a
 * free-text `agent` param. No allowlist check inside execute() for WHICH agents can be targeted —
 * the tool's mere presence in the caller's available tools (granted implicitly by
 * LLM.filterToolsByAgent from the caller's "agent"-resource permission rules) IS that authorization.
 * See packages/session/src/llm.ts filterToolsByAgent and packages/runtime/src/agent.ts.
 *
 * message_session/reply_session on a session OUTSIDE the caller's own subtree additionally go
 * through ctx.ask (same convention session_tree uses for cross-session reads) and respect the
 * target session's sendPolicy — within your own subtree (something you or an ancestor spawned),
 * no prompt is needed.
 */
export function createAgentTargetTool(target: AgentTarget): Tool.Info {
  const description = [
    `Create a session with, message, or reply to the "${target.name}" agent.`,
    target.description ? `${target.name}: ${target.description}` : undefined,
    "",
    "Actions:",
    "- create_session: start a new session with an initial message.",
    "- message_session: post a follow-up into an existing session and trigger a response — prefer this over " +
      "create_session when you already have a live session with this agent and just need clarification or a " +
      "small additional task, rather than duplicating the exploration/work from scratch.",
    "- reply_session: post a message into an existing session without triggering a new turn (ingest).",
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
      // HostServices.session type declaration — same widening delegate.ts/reply.ts used.
      const sessionSvc = h.session as any
      if (!sessionSvc) throw new Error("session service not available")

      // ── Cross-subtree gate + sendPolicy — applies to any call naming an existing session_id ──
      if (params.session_id && (params.action === "message_session" || params.action === "reply_session")) {
        const target_ = await sessionSvc.get(params.session_id)
        if (!target_) throw new Error(`Session not found: ${params.session_id}`)

        const [callerRoot, targetRoot] = await Promise.all([
          findRoot(sessionSvc, ctx.sessionID),
          findRoot(sessionSvc, params.session_id),
        ])
        if (callerRoot !== targetRoot) {
          await ctx.ask({
            permission: "session_get",
            patterns: [],
            always: ["*"],
            metadata: { sessionId: params.session_id },
          })
        }

        if (evaluateSendPolicy(target_.sendPolicy, ctx.agent) === "deny") {
          throw new Error(`Session ${params.session_id} does not accept messages from ${ctx.agent}.`)
        }
      }

      if (params.action === "reply_session") {
        const message =
          params.data !== undefined
            ? `${params.message}\n\n<result_data>\n${JSON.stringify(params.data, null, 2)}\n</result_data>`
            : params.message!

        if (!sessionSvc.reply) throw new Error("session reply service not available")
        const msg = (await sessionSvc.reply({
          sessionID: params.session_id!,
          agentID: ctx.agent,
          message,
          parentMessageID: ctx.messageID,
        })) as any

        return {
          title: `Reply → ${params.session_id!.slice(0, 8)}…`,
          metadata: {
            sessionId: params.session_id as string | undefined,
            messageId: msg?.id,
            agent: target.id,
            kind: "reply" as string,
            mode: undefined as string | undefined,
            created: undefined as boolean | undefined,
            action: params.action as string,
            data: params.data as Record<string, unknown> | undefined,
          },
          output: `Message posted to session ${params.session_id}.`,
        }
      }

      // create_session / message_session
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

      let targetSessionId: string
      let created = false

      if (params.action === "message_session") {
        targetSessionId = params.session_id!
      } else {
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
        targetSessionId = newSession.id
        created = true
      }

      if (targetSessionId === ctx.sessionID) {
        throw new Error(`Cannot target the current session (${targetSessionId}).`)
      }

      if (replyToSessionID && !created && sessionSvc.setReplyToSessionID) {
        await sessionSvc.setReplyToSessionID({ sessionID: targetSessionId, replyToSessionID })
      }

      // Unlock this caller's own agent__<caller> tool in the target session so a downstream
      // agent can reply/message back even without a standing allow rule for the caller
      // (mirrors skill_load's per-session tool-unlock mechanism).
      if (h.skillTools?.add && ctx.agent) {
        h.skillTools.add(targetSessionId, [`agent__${ctx.agent}`])
      }

      ctx.metadata({
        title: params.title ?? `${params.action} → ${target.id}`,
        metadata: { sessionId: targetSessionId, agent: target.id, mode: resolvedMode, created, action: params.action },
      })

      const promptParts = (await resolvePromptParts(params.prompt!)) as any[]

      if (params.action === "create_session" && params.skills?.length && created) {
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
            "When you complete this task, use your agent__<caller> reply_session action to send results back.",
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
          // Follow-ups queue behind the target's current turn instead of throwing on busy or
          // racing its in-flight loop — safe because a queued message on an idle session is
          // activated immediately on the very next loop iteration, and on a busy session it
          // is picked up at the next natural turn boundary.
          queued: params.action === "message_session",
          noWait: !wait,
          parentMessageID: ctx.messageID,
          format,
          parts: promptParts,
        })) as any
      } finally {
        if (wait) ctx.abort.removeEventListener("abort", onAbort)
      }

      const text = result?.parts?.findLast?.((p: any) => p.type === "text")?.text ?? ""
      const resultTag = created ? "spawn_result" : "delegation_result"

      const sharedMeta = {
        sessionId: targetSessionId as string | undefined,
        agent: target.id,
        messageId: result?.info?.id,
        kind: params.action as string,
        mode: resolvedMode as string | undefined,
        created: created as boolean | undefined,
        action: params.action as string,
        data: undefined as Record<string, unknown> | undefined,
      }

      if (!wait) {
        // Async: nothing to finalize here — Delegation's three delivery layers (loop-end
        // callback, session.status bus backstop, boot reconcile) own the edge from here on.
        return {
          title: params.title ?? `${params.action} → ${target.id}`,
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
        title: params.title ?? `${params.action} → ${target.id}`,
        metadata: sharedMeta,
        output: [
          `session_id: ${targetSessionId}`,
          `agent: ${target.id}`,
          `mode: ${resolvedMode}`,
          "",
          `<${resultTag}>`,
          text,
          `</${resultTag}>`,
        ].join("\n"),
      }
    },
  }))
}
