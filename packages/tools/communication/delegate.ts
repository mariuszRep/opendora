import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./delegate.json"

const parameters = z
  .object({
    agent: z
      .string()
      .describe("Target agent name (exact match from agent list). Required unless session_id alone identifies the target.")
      .optional(),
    session_id: z
      .string()
      .describe("Target a specific existing session by ID. Mutually exclusive with session_type. Use for continuing conversations in existing sessions.")
      .optional(),
    session_type: z
      .enum(["worker", "scope", "scratchpad", "role"])
      .describe("Create a new session of this type. Choose based on task: role=ongoing relationship, scope=project-based, worker=quick task, scratchpad=experimental. Mutually exclusive with session_id.")
      .optional(),
    title: z
      .string()
      .describe("Title for the new session. Highly recommended for clarity when session_type is provided. Make it descriptive of the task.")
      .optional(),
    prompt: z.string().describe("Message to send to the target session. Be clear and specific about what you want the agent to do."),
    description: z.string().describe("Short label for this delegation (appears in logs and UI). Optional but helpful for tracking.").optional(),
    reply_to: z
      .string()
      .describe(
        "Session ID where replies should be sent. Required when mode is 'async'. Omit for 'sync' blocking delegations. Use YOUR session ID to get replies back to you, or use the UPSTREAM session ID (from 'Reply to session ID' in context) to forward replies to the original requester.",
      )
      .optional(),
    mode: z
      .enum(["sync", "async"])
      .optional()
      .describe(
        "Delegation mode. 'sync' blocks until the agent replies inline — use when you need the result before your next step. 'async' fires without blocking; the downstream agent posts results via reply to reply_to. If omitted, inferred from reply_to: async if reply_to is provided, sync if not.",
      ),
    result_schema: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "JSON Schema object describing the expected structure of the result. For sync delegations, the result is parsed as JSON and validated. For async delegations, the schema is injected as a hidden instruction so the downstream agent knows what format to reply with. Example: { \"type\": \"object\", \"properties\": { \"status\": { \"type\": \"string\" } }, \"required\": [\"status\"] }",
      ),
    intercepting: z
      .boolean()
      .optional()
      .describe(
        "Set to true to explicitly opt in to intercepting the upstream return path. Required when your session has an upstream replyToSessionID and you intentionally route reply_to to your own session. Without this flag, such routing throws a contract violation error.",
      ),
  })
  .superRefine((value, ctx) => {
    if (!value.agent && !value.session_id) {
      ctx.addIssue({
        code: "custom",
        path: ["agent"],
        message: "agent or session_id is required. Choose: 1) agent for their main session, 2) agent + session_type for new session, or 3) session_id for existing session",
      })
    }
    if (value.session_id && value.session_type) {
      ctx.addIssue({
        code: "custom",
        path: ["session_type"],
        message: "session_type cannot be combined with session_id. Use session_id for existing sessions OR session_type for new sessions, not both.",
      })
    }
    if (value.session_type && !value.agent) {
      ctx.addIssue({
        code: "custom",
        path: ["agent"],
        message: "agent is required when using session_type. You need to specify which agent should handle the new session.",
      })
    }
    if (value.session_type && !value.title) {
      ctx.addIssue({
        code: "custom",
        path: ["title"],
        message: "title is highly recommended when creating new sessions. Without it, sessions get generic names and are hard to identify.",
      })
    }
    if (value.mode === "async" && !value.reply_to) {
      ctx.addIssue({
        code: "custom",
        path: ["reply_to"],
        message: "Async delegation requires reply_to. Provide the session ID where the downstream agent should post results.",
      })
    }
    if (value.mode === "sync" && value.reply_to) {
      ctx.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Sync delegation cannot have reply_to. Remove reply_to for sync mode, or change mode to 'async'.",
      })
    }
  })

function extractJsonFromText(text: string): unknown {
  try {
    return JSON.parse(text.trim())
  } catch {}
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch?.[1]) {
    try {
      return JSON.parse(blockMatch[1].trim())
    } catch {}
  }
  const objMatch = text.match(/(\{[\s\S]*\})/)
  if (objMatch?.[1]) {
    try {
      return JSON.parse(objMatch[1])
    } catch {}
  }
  return undefined
}

function validateAgainstSchema(data: unknown, schema: Record<string, unknown>): string[] {
  const errors: string[] = []
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push("Result must be a JSON object")
    return errors
  }
  const required = schema.required as string[] | undefined
  if (required && Array.isArray(required)) {
    const missing = required.filter((k) => !(k in (data as Record<string, unknown>)))
    if (missing.length > 0) errors.push(`Missing required fields: ${missing.join(", ")}`)
  }
  return errors
}

export const DelegateTool = Tool.define("delegate", async (initCtx?) => {
  const delegateAgents = initCtx?.agent?.delegateAgents

  const description =
    delegateAgents && delegateAgents.length > 0
      ? `${toolDef.description}\n\nAgents you may delegate to:\n${delegateAgents.map((a) => `- ${a.name}${a.description ? `: ${a.description}` : ""}`).join("\n")}\n\nYou must not delegate to any agent outside this list.`
      : toolDef.description

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      const sessionSvc = h.session as any
      if (!sessionSvc) throw new Error("session service not available")
      const promptFn = h.prompt as any
      if (!promptFn) throw new Error("prompt service not available")
      const resolvePromptParts = h.resolvePromptParts
      if (!resolvePromptParts) throw new Error("resolvePromptParts service not available")

      const replyToSessionID: string | undefined = params.reply_to
      const resolvedMode = params.mode ?? (replyToSessionID ? "async" : "sync")
      const wait = resolvedMode === "sync"

      // ── RETURN-PATH CONTRACT ENFORCEMENT (throws, not warns) ──────────────
      const currentSession = await sessionSvc.get(ctx.sessionID)
      const upstreamReturnPath = currentSession?.replyToSessionID

      if (upstreamReturnPath && resolvedMode === "async") {
        if (!replyToSessionID) {
          throw new Error(
            `[DELEGATE] Return-path contract violation: this session has upstream return path ${upstreamReturnPath} ` +
              `but reply_to was not provided for async delegation. ` +
              `Add reply_to: "${upstreamReturnPath}" to preserve the return path.`,
          )
        }

        if (replyToSessionID === ctx.sessionID && !params.intercepting) {
          throw new Error(
            `[DELEGATE] Return-path interception: this session has upstream return path ${upstreamReturnPath}, ` +
              `but reply_to points to your own session (${ctx.sessionID}). ` +
              `Forward reply_to: "${upstreamReturnPath}" unless you genuinely need to intercept. ` +
              `Set intercepting: true to explicitly opt in.`,
          )
        }

        if (replyToSessionID !== upstreamReturnPath && replyToSessionID !== ctx.sessionID) {
          console.warn(
            `[DELEGATE] ⚠️  Return-path misdirection: upstream is ${upstreamReturnPath} ` +
              `but reply_to is a different session (${replyToSessionID}). Verify this is intentional.`,
          )
        }
      }

      console.log(`[DELEGATE] mode=${resolvedMode}, reply_to=${replyToSessionID}, wait=${wait}`)

      let targetSession: any
      let targetAgentName: string | undefined
      let lookedUpAgent: any = undefined
      let created = false
      let route: string

      if (params.session_id) {
        targetSession = await sessionSvc.get(params.session_id)
        if (!targetSession) throw new Error(`Session not found: ${params.session_id}`)
        targetAgentName = params.agent ?? targetSession.agentID
        route = "existing_session"
      } else {
        const agents = h.agents as any
        if (!agents) throw new Error("agents service not available")
        const allAgents = (await agents.list()) as any[]
        lookedUpAgent = allAgents.find((a: any) => a.name === params.agent || a.id === params.agent)
        if (!lookedUpAgent) throw new Error(`Unknown agent: ${params.agent}`)
        targetAgentName = lookedUpAgent.id

        if (params.session_type) {
          targetSession = await sessionSvc.create({
            title: params.title ?? params.description ?? `Task (@${targetAgentName})`,
            sessionType: params.session_type,
            agentID: targetAgentName,
            ownerID: ctx.agent,
            ownerKind: "agent",
            parentSessionID: ctx.sessionID,
            ...(replyToSessionID ? { replyToSessionID } : {}),
          })
          created = true
          route = "new_session"
        } else {
          const mainSession = await sessionSvc.ensureMainSession(targetAgentName)

          // Self-delegation via agent_main: agent resolved to its own current session.
          // Always force a worker subsession — there is no valid reason to delegate
          // into the same session context. session_type is not required for this path.
          if (mainSession.id === ctx.sessionID) {
            targetSession = await sessionSvc.create({
              title: params.title ?? params.description ?? `Self-task (@${targetAgentName})`,
              sessionType: "worker",
              agentID: targetAgentName,
              ownerID: ctx.agent,
              ownerKind: "agent",
              parentSessionID: ctx.sessionID,
              ...(replyToSessionID ? { replyToSessionID } : {}),
            })
            created = true
            route = "self_subsession"
          } else {
            targetSession = mainSession
            route = "agent_main"
          }
        }
      }

      if (replyToSessionID && !created && sessionSvc.setReplyToSessionID) {
        await sessionSvc.setReplyToSessionID({ sessionID: targetSession.id, replyToSessionID })
      }

      if (targetAgentName) {
        const callerData = (await (h.agents as any)?.get(ctx.agent)) as any
        const allowedAgents = callerData?.config?.toolConfig?.delegate?.allowedAgents as string[] | undefined
        if (allowedAgents && allowedAgents.length > 0) {
          const targetName = lookedUpAgent?.name ?? targetAgentName
          if (!allowedAgents.includes(targetName)) {
            throw new Error(
              `Agent "${targetName}" is not in this agent's allowed delegation list. ` + `Allowed: ${allowedAgents.join(", ")}`,
            )
          }
        }
      }

      if (targetAgentName) {
        await ctx.ask({
          permission: "task",
          patterns: [targetAgentName],
          always: ["*"],
          metadata: {
            description: params.description ?? `Delegate to ${targetAgentName}`,
            subagent_type: targetAgentName,
          },
        })
      }

      if (targetSession.id === ctx.sessionID) {
        throw new Error(
          `Cannot delegate to the current session (${targetSession.id}). ` + `Provide session_type to create a new worker session instead.`,
        )
      }

      const promptParts = (await resolvePromptParts(params.prompt)) as any[]

      if (replyToSessionID) {
        promptParts.push({
          type: "text",
          text: [
            `Return path: ${replyToSessionID}`,
            `When you complete this task, use the reply tool to send your results back to the requesting session.`,
            `If the user engages with you directly in this session, respond to them here instead of using reply.`,
          ].join("\n"),
          hidden: true,
        } as any)
      }

      if (params.result_schema) {
        const schemaInstruction =
          resolvedMode === "sync"
            ? [
                "Result format: your final response must be a valid JSON object conforming to this schema:",
                "```json",
                JSON.stringify(params.result_schema, null, 2),
                "```",
                "Return only the raw JSON object — no prose, no markdown wrapping.",
              ].join("\n")
            : [
                "Result format: when using the reply tool, your message must be a valid JSON object conforming to this schema:",
                "```json",
                JSON.stringify(params.result_schema, null, 2),
                "```",
                "The reply message should be the raw JSON object only — no prose, no markdown wrapping.",
              ].join("\n")

        promptParts.push({ type: "text", text: schemaInstruction, hidden: true } as any)
      }

      const result = await promptFn({
        sessionID: targetSession.id,
        ...(targetAgentName ? { agent: targetAgentName } : {}),
        noWait: !wait,
        parentMessageID: ctx.messageID,
        parts: promptParts,
      })

      const text = result.parts.findLast((part: any) => part.type === "text")?.text ?? ""
      const resultTag = created ? "spawn_result" : "delegation_result"

      // ── Sync result: validate against result_schema if provided ──────────
      let validationSummary = ""
      let parsedData: Record<string, unknown> | undefined = undefined

      if (wait && params.result_schema) {
        const raw = extractJsonFromText(text)
        if (raw === undefined) {
          validationSummary = "\nresult_schema_validation: FAILED — result is not valid JSON"
        } else {
          const errors = validateAgainstSchema(raw, params.result_schema)
          parsedData = raw as Record<string, unknown>
          validationSummary =
            errors.length === 0
              ? "\nresult_schema_validation: PASSED"
              : `\nresult_schema_validation: FAILED — ${errors.join("; ")}`
        }
      }

      // Consistent metadata shape across both branches avoids TypeScript union conflicts.
      const sharedMeta = {
        sessionId: targetSession.id as string,
        agent: targetAgentName as string | undefined,
        messageId: result.info.id as string,
        mode: resolvedMode as string,
        parsedData,
      }

      if (!wait) {
        return {
          title: params.description ?? `Delegated to ${targetAgentName ?? targetSession.id}`,
          metadata: sharedMeta,
          output: [
            `session_id: ${targetSession.id}`,
            `agent: ${targetAgentName ?? "(session default)"}`,
            `route: ${route}`,
            `mode: ${resolvedMode}`,
            `message_id: ${result.info.id}`,
            `reply_mode: reply → session ${params.reply_to}`,
            "status: message posted",
          ].join("\n"),
        }
      }

      return {
        title: params.description ?? `Delegated to ${targetAgentName ?? targetSession.id}`,
        metadata: sharedMeta,
        output: [
          `session_id: ${targetSession.id}`,
          `agent: ${targetAgentName ?? "(session default)"}`,
          `route: ${route}`,
          `mode: ${resolvedMode}`,
          "",
          `<${resultTag}>`,
          text,
          `</${resultTag}>`,
          validationSummary,
        ]
          .join("\n")
          .trimEnd(),
      }
    },
  }
})
