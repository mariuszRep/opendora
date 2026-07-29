import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { evaluateSendPolicy } from "@projectflows/session"
import { Identifier } from "@projectflows/util/id"

const parameters = z
  .object({
    session_id: z.string().describe("Target session to message or reply into."),
    action: z
      .enum(["message", "reply"])
      .describe(
        "message: post a prompt into the target session and trigger its response — use this for follow-up " +
          "questions into a session you (or another agent) already spawned, instead of spawning a new one and " +
          "duplicating work. reply: post a message into the target session as an ingest — does NOT trigger a " +
          "new turn (use this to deliver a delegated task's result back to whichever session is waiting on it).",
      ),
    prompt: z.string().describe("Message to send. Required for action 'message'.").optional(),
    message: z.string().describe("Text content to post. Required for action 'reply'.").optional(),
    data: z
      .record(z.string(), z.unknown())
      .describe("Optional structured JSON payload appended to a reply message.")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "message" && !value.prompt) {
      ctx.addIssue({ code: "custom", path: ["prompt"], message: "prompt is required for action 'message'" })
    }
    if (value.action === "reply" && !value.message) {
      ctx.addIssue({ code: "custom", path: ["message"], message: "message is required for action 'reply'" })
    }
  })

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
 * Generic, non-per-target follow-up tool: message or reply into ANY existing session by id,
 * unlike agent__<id> (which only spawns new sessions with a specific target agent). A session's
 * own stored agentID already says who owns it, so no baked-in target is needed here — this is
 * what every agent__<id> spawn unlocks in its child session (see agent-target.ts's
 * `h.skillTools.add(targetSessionId, ["session_message"])`) so the child can talk back.
 *
 * Same-subtree calls (something you or an ancestor spawned) are allowed outright, subject to the
 * target's sendPolicy; cross-subtree calls go through ctx.ask (same convention session_tree uses
 * for cross-session reads) before the sendPolicy check.
 */
export function createSessionMessageTool(): Tool.Info {
  const description = [
    "Message or reply into an existing session by id — the generic follow-up tool for any session, not just",
    "ones spawned via a specific agent__<id> tool.",
    "",
    "Actions:",
    "- message: post a prompt into the target session and trigger a response — prefer this over spawning a " +
      "new session when you already have a live one and just need clarification or a small additional task.",
    "- reply: post a message into the target session without triggering a new turn (ingest) — use this to " +
      "deliver a delegated task's result back to whichever session is waiting on it.",
  ].join("\n")

  return Tool.define("session_message", async () => ({
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      // Cast: the host-provided session service includes get/reply at runtime (packages/session/src/prompt.ts
      // resolveTools wiring) but they predate the HostServices.session type declaration — same widening
      // agent-target.ts uses.
      const sessionSvc = h.session as any
      if (!sessionSvc) throw new Error("session service not available")

      // Self-targeting the caller's own live session would post into (or replay a turn onto) a session
      // that's currently executing this very tool call — always wrong.
      if (params.session_id === ctx.sessionID) {
        throw new Error(
          `Cannot ${params.action === "reply" ? "reply to" : "message"} your own current session ` +
            `(${params.session_id}). Just respond directly instead.`,
        )
      }

      const target = await sessionSvc.get(params.session_id)
      if (!target) throw new Error(`Session not found: ${params.session_id}`)

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

      if (target.sendPolicy && evaluateSendPolicy(target.sendPolicy, { kind: "assistant", id: ctx.agent }) === "deny") {
        throw new Error(`Session ${params.session_id} does not accept messages from ${ctx.agent}.`)
      }

      if (params.action === "reply") {
        const message =
          params.data !== undefined
            ? `${params.message}\n\n<result_data>\n${JSON.stringify(params.data, null, 2)}\n</result_data>`
            : params.message!

        if (!sessionSvc.reply) throw new Error("session reply service not available")
        const msg = (await sessionSvc.reply({
          sessionID: params.session_id,
          agentID: ctx.agent,
          message,
          parentMessageID: ctx.messageID,
        })) as any

        return {
          title: `Reply → ${params.session_id.slice(0, 8)}…`,
          metadata: {
            sessionId: params.session_id as string | undefined,
            messageId: msg?.id,
            agent: target.agentID as string | undefined,
            kind: "reply" as string,
            action: params.action as string,
            data: params.data as Record<string, unknown> | undefined,
          },
          output: `Message posted to session ${params.session_id}.`,
        }
      }

      // action: "message"
      const promptFn = h.prompt
      if (!promptFn) throw new Error("prompt service not available")
      const resolvePromptParts = h.resolvePromptParts
      if (!resolvePromptParts) throw new Error("resolvePromptParts service not available")

      ctx.metadata({
        title: `Message → ${params.session_id.slice(0, 8)}…`,
        metadata: { sessionId: params.session_id, agent: target.agentID, action: params.action },
      })

      const promptParts = (await resolvePromptParts(params.prompt!)) as any[]
      const messageID = Identifier.ascending("message")

      const result = (await promptFn({
        sessionID: params.session_id,
        agent: target.agentID,
        messageID,
        // Follow-ups queue behind the target's current turn instead of throwing on busy or racing its
        // in-flight loop — safe because a queued message on an idle session is activated immediately on
        // the very next loop iteration, and on a busy session it is picked up at the next natural turn
        // boundary (same reasoning agent-target.ts's old message_session action used).
        queued: true,
        noWait: false,
        parentMessageID: ctx.messageID,
        parts: promptParts,
      })) as any

      const text = result?.parts?.findLast?.((p: any) => p.type === "text")?.text ?? ""

      return {
        title: `Message → ${params.session_id.slice(0, 8)}…`,
        metadata: {
          sessionId: params.session_id as string | undefined,
          agent: target.agentID as string | undefined,
          messageId: result?.info?.id,
          kind: "message" as string,
          action: params.action as string,
          data: undefined as Record<string, unknown> | undefined,
        },
        output: [
          `session_id: ${params.session_id}`,
          `agent: ${target.agentID}`,
          "",
          "<message_result>",
          text,
          "</message_result>",
        ].join("\n"),
      }
    },
  }))
}
