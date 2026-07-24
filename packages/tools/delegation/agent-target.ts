import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"

export interface AgentTarget {
  /** Stable agent id (folder-derived), baked into the tool id as agent__<id> */
  id: string
  /** Display name — same as id for this codebase's convention, but kept separate for clarity */
  name: string
  description?: string
}

const parameters = z
  .object({
    action: z
      .enum(["create_session", "message_session", "reply_session"])
      .describe(
        "create_session: start a new session with the target agent and an initial message. " +
          "message_session: post into an existing session of the target agent and trigger its response. " +
          "reply_session: post a message into an existing session as an ingest — does NOT trigger a new turn.",
      ),
    session_id: z
      .string()
      .describe("Existing session ID. Required for message_session and reply_session. Ignored for create_session.")
      .optional(),
    session_type: z
      .enum(["worker", "scope", "scratchpad", "role"])
      .describe("Type of new session to create. Only used by create_session. Defaults to 'worker'.")
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
          "'async' fires without blocking — the target agent should post its result back via reply_session " +
          "to reply_to. Defaults to 'sync' unless reply_to is set.",
      )
      .optional(),
    reply_to: z
      .string()
      .describe(
        "create_session/message_session only. Session ID the target agent should reply_session into. " +
          "Required when mode is 'async'.",
      )
      .optional(),
    skills: z
      .array(z.string())
      .describe("create_session only. Skill names to preload into the new session before the prompt is posted.")
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
    if (value.mode === "async" && !value.reply_to) {
      ctx.addIssue({ code: "custom", path: ["reply_to"], message: "async mode requires reply_to" })
    }
  })

/**
 * Builds a Tool.Info for a single delegation target agent, covering the 3 interaction modes
 * (create_session / message_session / reply_session) via an `action` param instead of a
 * free-text `agent` param. No allowlist check inside execute() — the tool's mere presence in the
 * caller's available tools (granted implicitly by LLM.filterToolsByAgent from the caller's
 * "agent"-resource permission rules) IS the authorization. See
 * packages/session/src/llm.ts filterToolsByAgent and packages/runtime/src/agent.ts.
 */
export function createAgentTargetTool(target: AgentTarget): Tool.Info {
  const description = [
    `Create a session with, message, or reply to the "${target.name}" agent.`,
    target.description ? `${target.name}: ${target.description}` : undefined,
    "",
    "Actions:",
    "- create_session: start a new session with an initial message.",
    "- message_session: post into an existing session and trigger a response.",
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

      let targetSessionId: string
      let created = false

      if (params.action === "message_session") {
        const existing = (await sessionSvc.get(params.session_id!)) as any
        if (!existing) throw new Error(`Session not found: ${params.session_id}`)
        targetSessionId = params.session_id!
      } else {
        const newSession = (await sessionSvc.createNext?.({
          title: params.title ?? `Task (@${target.id})`,
          sessionType: params.session_type ?? "worker",
          agentID: target.id,
          ownerID: ctx.agent,
          ownerKind: "agent",
          parentSessionID: ctx.sessionID,
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
      // agent can reply_session back even without a standing allow rule for the caller
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

      const result = (await promptFn({
        sessionID: targetSessionId,
        agent: target.id,
        noWait: !wait,
        parentMessageID: ctx.messageID,
        parts: promptParts,
      })) as any

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
        return {
          title: params.title ?? `${params.action} → ${target.id}`,
          metadata: sharedMeta,
          output: [
            `session_id: ${targetSessionId}`,
            `agent: ${target.id}`,
            `mode: ${resolvedMode}`,
            `message_id: ${result?.info?.id}`,
            "status: message posted",
          ].join("\n"),
        }
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
