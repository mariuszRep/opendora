import { Hono } from "hono"
import { stream } from "hono/streaming"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Session } from "@projectflows/session/session"
import { MessageV2 } from "@projectflows/session/message"
import { SessionPrompt } from "@projectflows/session/prompt"
import { SessionCompaction } from "@projectflows/session/compaction"
import { SessionRevert } from "@projectflows/session/revert"
import { SessionStatus } from "@projectflows/session/status"
import { SessionSummary } from "@projectflows/session/summary"
import { Todo } from "@projectflows/session/todo"
import { InstructionPrompt } from "@projectflows/session/instruction"
import { SystemPrompt } from "@projectflows/session/system"
import { getConfig } from "@projectflows/session/config"
import { sessionManager } from "@projectflows/session/session"
import { Agent } from "@projectflows/runtime/agent"
import { Skill } from "@projectflows/skills/skill"
import { WorkflowStorage } from "@projectflows/workflow/storage"
import { Instance } from "@projectflows/runtime/instance"
import { ToolRegistry } from "@projectflows/server/tool-registry"
import { MCP } from "../mcp"
import { getSkillTools } from "@projectflows/session/skill-tools"
import { Snapshot } from "@projectflows/runtime/snapshot"
import { Log } from "@projectflows/util/log"
import { PermissionNext } from "@projectflows/permission/next"
import { errors } from "../error"
import { lazy } from "@projectflows/util/lazy"

const log = Log.create({ service: "server" })

export const SessionRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List sessions",
        description: "Get a list of all OpenCode sessions, sorted by most recently updated.",
        operationId: "session.list",
        responses: {
          200: {
            description: "List of sessions",
            content: {
              "application/json": {
                schema: resolver(Session.Info.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional().meta({ description: "Filter sessions by project directory" }),
          roots: z.coerce.boolean().optional().meta({ description: "Only return root sessions (no parentID)" }),
          start: z.coerce
            .number()
            .optional()
            .meta({ description: "Filter sessions updated on or after this timestamp (milliseconds since epoch)" }),
          search: z.string().optional().meta({ description: "Filter sessions by title (case-insensitive)" }),
          limit: z.coerce.number().optional().meta({ description: "Maximum number of sessions to return" }),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const sessions: Session.Info[] = []
        for await (const session of Session.list({
          directory: query.directory,
          roots: query.roots,
          start: query.start,
          search: query.search,
          limit: query.limit,
        })) {
          sessions.push(session as Session.Info)
        }
        return c.json(sessions)
      },
    )
    .get(
      "/status",
      describeRoute({
        summary: "Get session status",
        description: "Retrieve the current status of all sessions, including active, idle, and completed states.",
        operationId: "session.status",
        responses: {
          200: {
            description: "Get session status",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), SessionStatus.Info)),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const result = SessionStatus.list()
        return c.json(result)
      },
    )
    .get(
      "/:sessionID",
      describeRoute({
        summary: "Get session",
        description: "Retrieve detailed information about a specific OpenCode session.",
        tags: ["Session"],
        operationId: "session.get",
        responses: {
          200: {
            description: "Get session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.get.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        log.info("SEARCH", { url: c.req.url })
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/children",
      describeRoute({
        summary: "Get session children",
        tags: ["Session"],
        description: "Retrieve all child sessions that were forked from the specified parent session.",
        operationId: "session.children",
        responses: {
          200: {
            description: "List of children",
            content: {
              "application/json": {
                schema: resolver(Session.Info.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.children.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await Session.children(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/todo",
      describeRoute({
        summary: "Get session todos",
        description: "Retrieve the todo list associated with a specific session, showing tasks and action items.",
        operationId: "session.todo",
        responses: {
          200: {
            description: "Todo list",
            content: {
              "application/json": {
                schema: resolver(Todo.Info.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const todos = await Todo.get(sessionID)
        return c.json(todos)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create session",
        description: "Create a new OpenCode session for interacting with AI assistants and managing conversations.",
        operationId: "session.create",
        responses: {
          ...errors(400),
          200: {
            description: "Successfully created session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
        },
      }),
      validator("json", Session.create.schema.optional()),
      async (c) => {
        const body = c.req.valid("json") ?? {}
        const session = await Session.create(body)
        return c.json(session)
      },
    )
    .delete(
      "/:sessionID",
      describeRoute({
        summary: "Delete session",
        description: "Delete a session and permanently remove all associated data, including messages and history.",
        operationId: "session.delete",
        responses: {
          200: {
            description: "Successfully deleted session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.remove.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.remove(sessionID)
        return c.json(true)
      },
    )
    .get(
      "/:sessionID/system-prompt",
      describeRoute({
        summary: "Get resolved system prompt",
        description: "Returns the full system prompt the agent sees for this session: persona, session boundary prompt, instruction files, injection, skills, and tools.",
        operationId: "session.systemPrompt",
        responses: {
          200: {
            description: "Resolved system prompt sections",
            content: {
              "application/json": {
                schema: resolver(z.object({
                  sections: z.array(z.object({ label: z.string(), content: z.string() })),
                  injection: z.string(),
                  skills: z.array(z.object({ name: z.string(), description: z.string(), content: z.string(), tools: z.array(z.string()).optional() })),
                  workflows: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().optional() })),
                  tools: z.array(z.object({ id: z.string(), description: z.string(), source: z.enum(["internal", "mcp"]), mcpServer: z.string().optional(), agentManaged: z.boolean(), skillUnlocked: z.boolean() })),
                  loadedSkillNames: z.array(z.string()),
                })),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ sessionID: z.string() })),
      async (c) => {
        const { sessionID } = c.req.valid("param")
        const session = await Session.get(sessionID)
        const sessionMeta = await sessionManager.getMeta(sessionID)
        const cfg = getConfig()

        const agent = session.agentID
          ? await cfg.agent?.getByIdOrName?.(session.agentID).catch(() => undefined)
            ?? await cfg.agent?.get?.(session.agentID).catch(() => undefined)
          : undefined

        const model = await (async () => {
          const agentModel = agent?.model
          if (agentModel) {
            // Fallback group: resolve to actual provider/model before calling getModel
            if (agentModel.providerID === "fallback") {
              const slot = await cfg.provider?.resolveFallback?.(agentModel.modelID).catch(() => undefined)
              if (slot) return cfg.provider?.getModel(slot.providerID, slot.modelID).catch(() => undefined)
              return undefined
            }
            return cfg.provider?.getModel(agentModel.providerID, agentModel.modelID).catch(() => undefined)
          }
          return cfg.provider?.defaultModel?.().catch(() => undefined)
        })()

        const sections = model
          ? await SystemPrompt.build({
              agent,
              model,
              sessionID,
              userSystem: sessionMeta?.systemPrompt,
            }).catch(() => [])
          : []

        const injection = session.agentID && agent?.enableInjection
          ? await Agent.getInjection(session.agentID).catch(() => "")
          : ""

        // Derive loaded skill names from two sources and merge them:
        // 1. Session message history — skill_load tool stores metadata.name on every completed call.
        //    This is the ground truth the agent itself uses (works across server restarts).
        // 2. "__skill__:<name>" markers in unlocked_tools — written by new skill_load code,
        //    acts as a fast cache and covers skills loaded via delegate preloading.
        const sessionUnlockedEarly = getSkillTools(sessionID)

        const fromMarkers = Array.from(sessionUnlockedEarly)
          .filter((e) => e.startsWith("__skill__:"))
          .map((e) => e.slice("__skill__:".length))

        const messages = await Session.messages({ sessionID }).catch(() => [] as any[])
        const fromHistory = new Set<string>()
        for (const msg of messages) {
          if (!Array.isArray(msg.parts)) continue
          for (const part of msg.parts as any[]) {
            if (part.type === "tool" && part.tool === "skill_load" && part.state?.status === "completed") {
              const name = part.state.metadata?.name as string | undefined
              if (name) fromHistory.add(name)
            }
          }
        }

        const loadedSkillNames = Array.from(new Set([...fromMarkers, ...fromHistory]))

        const agentSkillNames: string[] = (agent?.skills as string[] | undefined) ?? []
        const extraSkillNames = loadedSkillNames.filter((n) => !agentSkillNames.includes(n))
        const allSkillNames = [...agentSkillNames, ...extraSkillNames]

        const skills = allSkillNames.length > 0
          ? (await Promise.all(
              allSkillNames.map((name: string) => Skill.get(name).catch(() => null))
            )).filter((s): s is NonNullable<typeof s> => s != null).map((s) => ({
              name: s.name,
              description: s.description,
              content: s.content,
              tools: s.tools,
            }))
          : []

        const agentWorkflowIds: string[] = ((agent as any)?.workflows as string[] | undefined) ?? ((agent as any)?.config?.workflows as string[] | undefined) ?? []
        const workflows = agentWorkflowIds.length > 0
          ? (await Promise.all(
              agentWorkflowIds.map((id) => WorkflowStorage.get(Instance.directory, id).catch(() => null))
            )).filter((w): w is NonNullable<typeof w> => w != null).map((w) => ({
              id: w.id,
              name: w.name,
              description: w.description,
            }))
          : []

        const dummyModel = { providerID: "anthropic", modelID: "claude-sonnet-4-6" }
        const allInternal = await Promise.all(
          ToolRegistry.all().map(async (t) => {
            try {
              const tool = await t.init({ model: dummyModel })
              return { id: t.id, description: tool.description, source: "internal" as const }
            } catch {
              return { id: t.id, description: "", source: "internal" as const }
            }
          })
        )
        const allMcp = (await MCP.rawTools().catch(() => [])).map((t) => ({
          id: t.id,
          description: t.description,
          source: "mcp" as const,
          mcpServer: t.mcpServer,
        }))
        const allTools = [...allInternal, ...allMcp]

        const sessionUnlocked = sessionUnlockedEarly
        const agentToolIds = agent?.tools as string[] | undefined

        // agentManaged is only meaningful when the agent has an explicit tools list.
        // When there's no restriction every tool is accessible, so we don't tag it.
        const hasToolRestriction = Array.isArray(agentToolIds)
        const taggedTools = allTools.map((t) => ({
          ...t,
          agentManaged: hasToolRestriction ? agentToolIds!.includes(t.id) : false,
          skillUnlocked: sessionUnlocked.has(t.id),
        }))

        // Also surface skill-unlocked tool IDs that aren't in the registry
        const unknownSkillTools = Array.from(sessionUnlocked)
          .filter((id) => id.startsWith("__skill__:") || !allTools.some((t) => t.id === id))
          .filter((id) => !id.startsWith("__skill__:"))
          .map((id) => ({
            id,
            description: "",
            source: "internal" as const,
            agentManaged: hasToolRestriction ? agentToolIds!.includes(id) : false,
            skillUnlocked: true,
          }))

        const allTagged = [...taggedTools, ...unknownSkillTools]

        // When restricted, show only tools the agent can reach; otherwise show all
        const tools = hasToolRestriction
          ? allTagged.filter((t) => t.agentManaged || t.skillUnlocked)
          : allTagged

        return c.json({ sections, injection, skills, workflows, tools, loadedSkillNames })
      },
    )
    .patch(
      "/:sessionID",
      describeRoute({
        summary: "Update session",
        description: "Update properties of an existing session, such as title or other metadata.",
        operationId: "session.update",
        responses: {
          200: {
            description: "Successfully updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      validator(
        "json",
        z.object({
          title: z.string().optional(),
          agentID: z.string().nullable().optional(),
          parentSessionID: z.string().optional(),
          sessionStatus: z.enum(["active", "archived", "closed"]).optional(),
          sessionType: z.enum(["role", "scope", "worker", "scratchpad"]).optional(),
          retention: z
            .object({
              autoArchive: z.boolean().optional(),
              autoDelete: z.boolean().optional(),
              ttlMs: z.number().optional(),
              maxMessages: z.number().optional(),
              maxAgeDays: z.number().optional(),
              onExpire: z.enum(["archive", "close", "delete"]).optional(),
            })
            .optional(),
          sendPolicy: z
            .object({
              allow: z.array(z.string()),
              deny: z.array(z.string()),
            })
            .optional(),
          model: z.string().optional(),
          systemPrompt: z.string().optional(),
          path: z.string().nullable().optional(),
          readPath: z.string().nullable().optional(),
          cwd: z.string().nullable().optional(),
          time: z
            .object({
              archived: z.number().optional(),
            })
            .optional(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const updates = c.req.valid("json")

        let session = await Session.get(sessionID)
        if (updates.title !== undefined) {
          session = await Session.setTitle({ sessionID, title: updates.title })
        }
        if (updates.agentID !== undefined) {
          session = await Session.setAgentID({ sessionID, agentID: updates.agentID ?? "" })
        }
        if (updates.parentSessionID !== undefined) {
          session = await Session.setParentSessionID({ sessionID, parentSessionID: updates.parentSessionID })
        }
        if (updates.sessionStatus !== undefined) {
          session = await Session.setSessionStatus({ sessionID, status: updates.sessionStatus })
        }
        if (updates.sessionType !== undefined) {
          session = await Session.setSessionType({ sessionID, sessionType: updates.sessionType })
        }
        if (updates.retention !== undefined) {
          session = await Session.setRetention({ sessionID, retention: updates.retention })
        }
        if (updates.sendPolicy !== undefined) {
          session = await Session.setSendPolicy({ sessionID, policy: updates.sendPolicy })
        }
        if (updates.systemPrompt !== undefined) {
          session = await Session.setSystemPrompt({ sessionID, systemPrompt: updates.systemPrompt })
        }
        if (updates.path !== undefined) {
          session = await Session.setPath({ sessionID, path: updates.path })
        }
        if (updates.readPath !== undefined) {
          session = await Session.setReadPath({ sessionID, readPath: updates.readPath })
        }
        if (updates.cwd !== undefined) {
          session = await Session.setCwd({ sessionID, cwd: updates.cwd })
        }
        if (updates.model !== undefined) {
          session = await Session.setModel({ sessionID, model: updates.model })
        }
        if (updates.time?.archived !== undefined) {
          session = await Session.setArchived({ sessionID, time: updates.time.archived })
        }

        return c.json(session)
      },
    )
    .post(
      "/:sessionID/init",
      describeRoute({
        summary: "Initialize session",
        description:
          "Analyze the current application and create an AGENTS.md file with project-specific agent configurations.",
        operationId: "session.init",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", Session.initialize.schema.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        await Session.initialize({ ...body, sessionID })
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/fork",
      describeRoute({
        summary: "Fork session",
        description: "Create a new session by forking an existing session at a specific message point.",
        operationId: "session.fork",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.fork.schema.shape.sessionID,
        }),
      ),
      validator("json", Session.fork.schema.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const result = await Session.fork({ ...body, sessionID })
        return c.json(result)
      },
    )
    .post(
      "/:sessionID/abort",
      describeRoute({
        summary: "Abort session",
        description: "Abort an active session and stop any ongoing AI processing or command execution.",
        operationId: "session.abort",
        responses: {
          200: {
            description: "Aborted session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        SessionPrompt.cancel(c.req.valid("param").sessionID)
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/share",
      describeRoute({
        summary: "Share session",
        description: "Create a shareable link for a session, allowing others to view the conversation.",
        operationId: "session.share",
        responses: {
          200: {
            description: "Successfully shared session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.share(sessionID)
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/diff",
      describeRoute({
        summary: "Get message diff",
        description: "Get the file changes (diff) that resulted from a specific user message in the session.",
        operationId: "session.diff",
        responses: {
          200: {
            description: "Successfully retrieved diff",
            content: {
              "application/json": {
                schema: resolver(Snapshot.FileDiff.array()),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: SessionSummary.diff.schema.shape.sessionID,
        }),
      ),
      validator(
        "query",
        z.object({
          messageID: SessionSummary.diff.schema.shape.messageID,
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const params = c.req.valid("param")
        const result = await SessionSummary.diff({
          sessionID: params.sessionID,
          messageID: query.messageID,
        })
        return c.json(result)
      },
    )
    .delete(
      "/:sessionID/share",
      describeRoute({
        summary: "Unshare session",
        description: "Remove the shareable link for a session, making it private again.",
        operationId: "session.unshare",
        responses: {
          200: {
            description: "Successfully unshared session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.unshare.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.unshare(sessionID)
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/summarize",
      describeRoute({
        summary: "Summarize session",
        description: "Generate a concise summary of the session using AI compaction to preserve key information.",
        operationId: "session.summarize",
        responses: {
          200: {
            description: "Summarized session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          providerID: z.string(),
          modelID: z.string(),
          auto: z.boolean().optional().default(false),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const session = await Session.get(sessionID)
        await SessionRevert.cleanup(session, {
          getMessages: (id: string) => Session.messages({ sessionID: id }),
          clearRevert: (id: string) => Session.clearRevert(id),
        })
        const msgs = await Session.messages({ sessionID })
        let currentAgent = await Agent.defaultAgent()
        for (let i = msgs.length - 1; i >= 0; i--) {
          const info = msgs[i].info
          if (info.role === "user") {
            currentAgent = info.agent || (await Agent.defaultAgent())
            break
          }
        }
        await SessionCompaction.create({
          sessionID,
          agent: currentAgent,
          model: {
            providerID: body.providerID,
            modelID: body.modelID,
          },
          auto: body.auto,
        })
        await SessionPrompt.loop({ sessionID })
        return c.json(true)
      },
    )
    .get(
      "/:sessionID/message",
      describeRoute({
        summary: "Get session messages",
        description: "Retrieve all messages in a session, including user prompts and AI responses.",
        operationId: "session.messages",
        responses: {
          200: {
            description: "List of messages",
            content: {
              "application/json": {
                schema: resolver(MessageV2.WithParts.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator(
        "query",
        z.object({
          limit: z.coerce.number().optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const messages = await Session.messages({
          sessionID: c.req.valid("param").sessionID,
          limit: query.limit,
        })
        return c.json(messages)
      },
    )
    .get(
      "/:sessionID/message/:messageID",
      describeRoute({
        summary: "Get message",
        description: "Retrieve a specific message from a session by its message ID.",
        operationId: "session.message",
        responses: {
          200: {
            description: "Message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Info,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        const message = await MessageV2.get({
          sessionID: params.sessionID,
          messageID: params.messageID,
        })
        return c.json(message)
      },
    )
    .delete(
      "/:sessionID/message/:messageID",
      describeRoute({
        summary: "Delete message",
        description:
          "Permanently delete a specific message (and all of its parts) from a session. This does not revert any file changes that may have been made while processing the message.",
        operationId: "session.deleteMessage",
        responses: {
          200: {
            description: "Successfully deleted message",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        SessionPrompt.assertNotBusy(params.sessionID)
        await Session.removeMessage({
          sessionID: params.sessionID,
          messageID: params.messageID,
        })
        return c.json(true)
      },
    )
    .delete(
      "/:sessionID/message/:messageID/part/:partID",
      describeRoute({
        description: "Delete a part from a message",
        operationId: "part.delete",
        responses: {
          200: {
            description: "Successfully deleted part",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
          partID: z.string().meta({ description: "Part ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        await Session.removePart({
          sessionID: params.sessionID,
          messageID: params.messageID,
          partID: params.partID,
        })
        return c.json(true)
      },
    )
    .patch(
      "/:sessionID/message/:messageID/part/:partID",
      describeRoute({
        description: "Update a part in a message",
        operationId: "part.update",
        responses: {
          200: {
            description: "Successfully updated part",
            content: {
              "application/json": {
                schema: resolver(MessageV2.Part),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
          partID: z.string().meta({ description: "Part ID" }),
        }),
      ),
      validator("json", MessageV2.Part),
      async (c) => {
        const params = c.req.valid("param")
        const body = c.req.valid("json")
        if (body.id !== params.partID || body.messageID !== params.messageID || body.sessionID !== params.sessionID) {
          throw new Error(
            `Part mismatch: body.id='${body.id}' vs partID='${params.partID}', body.messageID='${body.messageID}' vs messageID='${params.messageID}', body.sessionID='${body.sessionID}' vs sessionID='${params.sessionID}'`,
          )
        }
        const part = await Session.updatePart(body)
        return c.json(part)
      },
    )
    .post(
      "/:sessionID/message",
      describeRoute({
        summary: "Send message",
        description: "Create and send a new message to a session, streaming the AI response.",
        operationId: "session.prompt",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        c.status(200)
        c.header("Content-Type", "application/json")
        return stream(c, async (stream) => {
          const sessionID = c.req.valid("param").sessionID
          const body = c.req.valid("json")
          const msg = await SessionPrompt.prompt({ ...body, sessionID })
          stream.write(JSON.stringify(msg))
        })
      },
    )
    .post(
      "/:sessionID/prompt_async",
      describeRoute({
        summary: "Send async message",
        description:
          "Create and send a new message to a session asynchronously, starting the session if needed and returning immediately.",
        operationId: "session.prompt_async",
        responses: {
          204: {
            description: "Prompt accepted",
          },
          ...errors(400, 404, 409),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const status = SessionStatus.get(sessionID)
        if (status.type === "busy") {
          return c.json({ message: "Session is busy, please wait for the current response to finish." }, 409)
        }
        const body = c.req.valid("json")
        // noWait: creates the user message synchronously (fires SSE), then runs
        // the agent loop in the background. Returns as soon as the message is
        // persisted so the HTTP 204 reaches the browser immediately.
        await SessionPrompt.prompt({ ...body, sessionID, noWait: true })
        return c.body(null, 204)
      },
    )
    .post(
      "/:sessionID/command",
      describeRoute({
        summary: "Send command",
        description: "Send a new command to a session for execution by the AI assistant.",
        operationId: "session.command",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.CommandInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const msg = await SessionPrompt.command({ ...body, sessionID })
        return c.json(msg)
      },
    )
    .post(
      "/:sessionID/shell",
      describeRoute({
        summary: "Run shell command",
        description: "Execute a shell command within the session context and return the AI's response.",
        operationId: "session.shell",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(MessageV2.Assistant),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.ShellInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const msg = await SessionPrompt.shell({ ...body, sessionID })
        return c.json(msg)
      },
    )
    .post(
      "/:sessionID/revert",
      describeRoute({
        summary: "Revert message",
        description: "Revert a specific message in a session, undoing its effects and restoring the previous state.",
        operationId: "session.revert",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      validator("json", SessionRevert.RevertInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        log.info("revert", c.req.valid("json"))
        const session = await SessionRevert.revert(
          { sessionID, ...c.req.valid("json") },
          {
            assertNotBusy: SessionPrompt.assertNotBusy,
            getMessages: (id: string) => Session.messages({ sessionID: id }),
            getSession: (id: string) => Session.get(id),
            setRevert: (input: any) => Session.setRevert(input),
          },
        )
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/unrevert",
      describeRoute({
        summary: "Restore reverted messages",
        description: "Restore all previously reverted messages in a session.",
        operationId: "session.unrevert",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await SessionRevert.unrevert(
          { sessionID },
          {
            assertNotBusy: SessionPrompt.assertNotBusy,
            getSession: (id: string) => Session.get(id),
            clearRevert: (id: string) => Session.clearRevert(id),
          },
        )
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/permissions/:permissionID",
      describeRoute({
        summary: "Respond to permission",
        deprecated: true,
        description: "Approve or deny a permission request from the AI assistant.",
        operationId: "permission.respond",
        responses: {
          200: {
            description: "Permission processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
          permissionID: z.string(),
        }),
      ),
      validator("json", z.object({ response: PermissionNext.Reply })),
      async (c) => {
        const params = c.req.valid("param")
        PermissionNext.reply({
          requestID: params.permissionID,
          reply: c.req.valid("json").response,
        })
        return c.json(true)
      },
    ),
)
