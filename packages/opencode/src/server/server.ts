import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Log } from "../util/log"
import { describeRoute, generateSpecs, validator, resolver, openAPIRouteHandler } from "hono-openapi"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { proxy } from "hono/proxy"
import { basicAuth } from "hono/basic-auth"
import z from "zod"
import { Provider } from "@opendora/provider/provider"
import { NamedError } from "@opendora/util/error"
import { LSP } from "../lsp"
import { Format } from "../format"
import { TuiRoutes } from "./routes/tui"
import { Instance } from "../project/instance"
import { Vcs } from "../project/vcs"
import { Skill } from "../skill/skill"
import { Auth } from "../auth"
import { Flag } from "../flag/flag"
import { Command } from "../command"
import { Global } from "../global"
import { ProjectRoutes } from "./routes/project"
import { SessionRoutes } from "./routes/session"
import { PtyRoutes } from "./routes/pty"
import { McpRoutes } from "./routes/mcp"
import { FileRoutes } from "./routes/file"
import { ConfigRoutes } from "./routes/config"
import { ExperimentalRoutes } from "./routes/experimental"
import { ProviderRoutes } from "./routes/provider"
import { AgentRoutes } from "./routes/agent"
import { ScheduleRoutes } from "./routes/schedule"
import { CronScheduler, type ScheduleDispatchFn } from "@opendora/schedule/cron-scheduler"
import { Database } from "../storage/db"
import { Agent } from "../agent"
import { lazy } from "../util/lazy"
import { InstanceBootstrap } from "../project/bootstrap"
import { NotFoundError } from "../storage/db"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { websocket } from "hono/bun"
import { HTTPException } from "hono/http-exception"
import { errors } from "./error"
import { QuestionRoutes } from "./routes/question"
import { PermissionRoutes } from "./routes/permission"
import { GlobalRoutes } from "./routes/global"
import { VoiceRoutes } from "./routes/voice"
import { AuthRoutes } from "./routes/auth"
import { MDNS } from "./mdns"
import { BusBridge } from "@opendora/session/bus-bridge"
import { retentionDaemon, sessionManager } from "@opendora/session/session"
import { configureSessionCore } from "./configure-session-core"
import { openDoraStorageAdapter } from "@opendora/session/storage-adapter"
import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
import { Identifier } from "@opendora/util/id"
import { MessageV2 } from "@opendora/session/message"

// @ts-ignore This global is needed to prevent ai-sdk from logging warnings to stdout https://github.com/vercel/ai/blob/2dc67e0ef538307f21368db32d5a12345d98831b/packages/ai/src/logger/log-warnings.ts#L85
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace Server {
  const log = Log.create({ service: "server" })

  let _url: URL | undefined
  let _corsWhitelist: string[] = []
  let _scheduleDispatch: ScheduleDispatchFn = async () => {}

  export function url(): URL {
    return _url ?? new URL("http://localhost:4096")
  }

  const app = new Hono()
  export const App: () => Hono = lazy(
    () =>
      // TODO: Break server.ts into smaller route files to fix type inference
      app
        .onError((err, c) => {
          log.error("failed", {
            error: err,
          })
          if (err instanceof NamedError) {
            let status: ContentfulStatusCode
            if (err instanceof NotFoundError) status = 404
            else if (err instanceof Provider.ModelNotFoundError) status = 400
            else if (err.name.startsWith("Worktree")) status = 400
            else status = 500
            return c.json(err.toObject(), { status })
          }
          if (err instanceof HTTPException) return err.getResponse()
          const message = err instanceof Error && err.stack ? err.stack : err.toString()
          return c.json(new NamedError.Unknown({ message }).toObject(), {
            status: 500,
          })
        })
        .use((c, next) => {
          // Allow CORS preflight requests to succeed without auth.
          // Browser clients sending Authorization headers will preflight with OPTIONS.
          if (c.req.method === "OPTIONS") return next()
          const password = Flag.OPENCODE_SERVER_PASSWORD
          if (!password) return next()
          const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
          return basicAuth({ username, password })(c, next)
        })
        .use(async (c, next) => {
          const skipLogging = c.req.path === "/log"
          if (!skipLogging) {
            log.info("request", {
              method: c.req.method,
              path: c.req.path,
            })
          }
          const timer = log.time("request", {
            method: c.req.method,
            path: c.req.path,
          })
          await next()
          if (!skipLogging) {
            timer.stop()
          }
        })
        .use(
          cors({
            origin(input) {
              if (!input) return

              if (input.startsWith("http://localhost:")) return input
              if (input.startsWith("http://127.0.0.1:")) return input
              if (
                input === "tauri://localhost" ||
                input === "http://tauri.localhost" ||
                input === "https://tauri.localhost"
              )
                return input

              // *.opencode.ai (https only, adjust if needed)
              if (/^https:\/\/([a-z0-9-]+\.)*opencode\.ai$/.test(input)) {
                return input
              }
              if (_corsWhitelist.includes(input)) {
                return input
              }

              return
            },
          }),
        )
        .route("/global", GlobalRoutes())
        .put(
          "/auth/:providerID",
          describeRoute({
            summary: "Set auth credentials",
            description: "Set authentication credentials",
            operationId: "auth.set",
            responses: {
              200: {
                description: "Successfully set authentication credentials",
                content: {
                  "application/json": {
                    schema: resolver(z.boolean()),
                  },
                },
              },
              ...errors(400),
            },
          }),
          validator(
            "param",
            z.object({
              providerID: z.string(),
            }),
          ),
          validator("json", Auth.Info),
          async (c) => {
            const providerID = c.req.valid("param").providerID
            const info = c.req.valid("json")
            await Auth.set(providerID, info)
            return c.json(true)
          },
        )
        .delete(
          "/auth/:providerID",
          describeRoute({
            summary: "Remove auth credentials",
            description: "Remove authentication credentials",
            operationId: "auth.remove",
            responses: {
              200: {
                description: "Successfully removed authentication credentials",
                content: {
                  "application/json": {
                    schema: resolver(z.boolean()),
                  },
                },
              },
              ...errors(400),
            },
          }),
          validator(
            "param",
            z.object({
              providerID: z.string(),
            }),
          ),
          async (c) => {
            const providerID = c.req.valid("param").providerID
            await Auth.remove(providerID)
            return c.json(true)
          },
        )
        .use(async (c, next) => {
          if (c.req.path === "/log") return next()
          const raw = c.req.query("directory") || c.req.header("x-opencode-directory") || process.cwd()
          const directory = (() => {
            try {
              return decodeURIComponent(raw)
            } catch {
              return raw
            }
          })()
          return Instance.provide({
            directory,
            init: InstanceBootstrap,
            async fn() {
              return next()
            },
          })
        })
        .get(
          "/doc",
          openAPIRouteHandler(app, {
            documentation: {
              info: {
                title: "opencode",
                version: "0.0.3",
                description: "opencode api",
              },
              openapi: "3.1.1",
            },
          }),
        )
        .use(validator("query", z.object({ directory: z.string().optional() })))
        .route("/project", ProjectRoutes())
        .route("/pty", PtyRoutes())
        .route("/config", ConfigRoutes())
        .route("/experimental", ExperimentalRoutes())
        .route("/session", SessionRoutes())
        .route("/permission", PermissionRoutes())
        .route("/question", QuestionRoutes())
        .route("/provider", ProviderRoutes())
        .route("/schedule", ScheduleRoutes(_scheduleDispatch))
        .route("/voice", VoiceRoutes())
        .route("/", FileRoutes())
        .route("/mcp", McpRoutes())
        .route("/tui", TuiRoutes())
        .post(
          "/instance/dispose",
          describeRoute({
            summary: "Dispose instance",
            description: "Clean up and dispose the current OpenCode instance, releasing all resources.",
            operationId: "instance.dispose",
            responses: {
              200: {
                description: "Instance disposed",
                content: {
                  "application/json": {
                    schema: resolver(z.boolean()),
                  },
                },
              },
            },
          }),
          async (c) => {
            await Instance.dispose()
            return c.json(true)
          },
        )
        .get(
          "/path",
          describeRoute({
            summary: "Get paths",
            description:
              "Retrieve the current working directory and related path information for the OpenCode instance.",
            operationId: "path.get",
            responses: {
              200: {
                description: "Path",
                content: {
                  "application/json": {
                    schema: resolver(
                      z
                        .object({
                          home: z.string(),
                          state: z.string(),
                          config: z.string(),
                          worktree: z.string(),
                          directory: z.string(),
                        })
                        .meta({
                          ref: "Path",
                        }),
                    ),
                  },
                },
              },
            },
          }),
          async (c) => {
            return c.json({
              home: Global.Path.home,
              state: Global.Path.state,
              config: Global.Path.config,
              worktree: Instance.worktree,
              directory: Instance.directory,
            })
          },
        )
        .get(
          "/vcs",
          describeRoute({
            summary: "Get VCS info",
            description:
              "Retrieve version control system (VCS) information for the current project, such as git branch.",
            operationId: "vcs.get",
            responses: {
              200: {
                description: "VCS info",
                content: {
                  "application/json": {
                    schema: resolver(Vcs.Info),
                  },
                },
              },
            },
          }),
          async (c) => {
            const branch = await Vcs.branch()
            return c.json({
              branch,
            })
          },
        )
        .get(
          "/command",
          describeRoute({
            summary: "List commands",
            description: "Get a list of all available commands in the OpenCode system.",
            operationId: "command.list",
            responses: {
              200: {
                description: "List of commands",
                content: {
                  "application/json": {
                    schema: resolver(Command.Info.array()),
                  },
                },
              },
            },
          }),
          async (c) => {
            const commands = await Command.list()
            return c.json(commands)
          },
        )
        .post(
          "/log",
          describeRoute({
            summary: "Write log",
            description: "Write a log entry to the server logs with specified level and metadata.",
            operationId: "app.log",
            responses: {
              200: {
                description: "Log entry written successfully",
                content: {
                  "application/json": {
                    schema: resolver(z.boolean()),
                  },
                },
              },
              ...errors(400),
            },
          }),
          validator(
            "json",
            z.object({
              service: z.string().meta({ description: "Service name for the log entry" }),
              level: z.enum(["debug", "info", "error", "warn"]).meta({ description: "Log level" }),
              message: z.string().meta({ description: "Log message" }),
              extra: z
                .record(z.string(), z.any())
                .optional()
                .meta({ description: "Additional metadata for the log entry" }),
            }),
          ),
          async (c) => {
            const { service, level, message, extra } = c.req.valid("json")
            const logger = Log.create({ service })

            switch (level) {
              case "debug":
                logger.debug(message, extra)
                break
              case "info":
                logger.info(message, extra)
                break
              case "error":
                logger.error(message, extra)
                break
              case "warn":
                logger.warn(message, extra)
                break
            }

            return c.json(true)
          },
        )
        .route("/agent", AgentRoutes())
        .get(
          "/skill",
          describeRoute({
            summary: "List skills",
            description: "Get a list of all available skills in the OpenCode system.",
            operationId: "app.skills",
            responses: {
              200: {
                description: "List of skills",
                content: {
                  "application/json": {
                    schema: resolver(Skill.Info.array()),
                  },
                },
              },
            },
          }),
          async (c) => {
            const skills = await Skill.all()
            return c.json(skills)
          },
        )
        .get(
          "/lsp",
          describeRoute({
            summary: "Get LSP status",
            description: "Get LSP server status",
            operationId: "lsp.status",
            responses: {
              200: {
                description: "LSP server status",
                content: {
                  "application/json": {
                    schema: resolver(LSP.Status.array()),
                  },
                },
              },
            },
          }),
          async (c) => {
            return c.json(await LSP.status())
          },
        )
        .get(
          "/formatter",
          describeRoute({
            summary: "Get formatter status",
            description: "Get formatter status",
            operationId: "formatter.status",
            responses: {
              200: {
                description: "Formatter status",
                content: {
                  "application/json": {
                    schema: resolver(Format.Status.array()),
                  },
                },
              },
            },
          }),
          async (c) => {
            return c.json(await Format.status())
          },
        )
        .get(
          "/event",
          describeRoute({
            summary: "Subscribe to events",
            description: "Get events",
            operationId: "event.subscribe",
            responses: {
              200: {
                description: "Event stream",
                content: {
                  "text/event-stream": {
                    schema: resolver(BusEvent.payloads()),
                  },
                },
              },
            },
          }),
          async (c) => {
            log.info("event connected")
            c.header("X-Accel-Buffering", "no")
            c.header("X-Content-Type-Options", "nosniff")
            return streamSSE(c, async (stream) => {
              stream.writeSSE({
                data: JSON.stringify({
                  type: "server.connected",
                  properties: {},
                }),
              })
              const unsub = Bus.subscribeAll(async (event) => {
                await stream.writeSSE({
                  data: JSON.stringify(event),
                })
                if (event.type === Bus.InstanceDisposed.type) {
                  stream.close()
                }
              })

              // Send heartbeat every 10s to prevent stalled proxy streams.
              const heartbeat = setInterval(() => {
                stream.writeSSE({
                  data: JSON.stringify({
                    type: "server.heartbeat",
                    properties: {},
                  }),
                })
              }, 10_000)

              await new Promise<void>((resolve) => {
                stream.onAbort(() => {
                  clearInterval(heartbeat)
                  unsub()
                  resolve()
                  log.info("event disconnected")
                })
              })
            })
          },
        )
        .all("/*", async (c) => {
          const path = c.req.path

          const response = await proxy(`https://app.opencode.ai${path}`, {
            ...c.req,
            headers: {
              ...c.req.raw.headers,
              host: "app.opencode.ai",
            },
          })
          response.headers.set(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:",
          )
          return response
        }) as unknown as Hono,
  )

  export async function openapi() {
    // Cast to break excessive type recursion from long route chains
    const result = await generateSpecs(App() as Hono, {
      documentation: {
        info: {
          title: "opencode",
          version: "1.0.0",
          description: "opencode api",
        },
        openapi: "3.1.1",
      },
    })
    return result
  }

  export function listen(opts: {
    port: number
    hostname: string
    mdns?: boolean
    mdnsDomain?: string
    cors?: string[]
  }) {
    configureSessionCore()
    _corsWhitelist = opts.cors ?? []

    // Define before App() is called so the route captures the real function, not the no-op.
    _scheduleDispatch = async (schedule) => {
      if (schedule.action_type === "tool" && schedule.tool_name === "delegate") {
        let params: any
        try { params = JSON.parse(schedule.prompt) } catch {
          log.warn("schedule delegate prompt is not valid JSON, skipping", { id: schedule.id })
          return
        }

        if (typeof params.prompt !== "string") {
          log.warn("schedule delegate: params.prompt is not a string, skipping", { id: schedule.id })
          return
        }

        // Resolve agent by name or ID (like the delegate tool does via agents.find)
        let resolvedAgentID: string | undefined
        if (params.agent) {
          const lookedUpAgent = await Agent.getByIdOrName(params.agent)
          if (!lookedUpAgent) {
            log.warn("schedule delegate: agent not found", { id: schedule.id, agent: params.agent })
            return
          }
          resolvedAgentID = lookedUpAgent.id
        }

        // Resolve source session (where the tool call appears in the UI)
        let sourceSessionID = schedule.session_id
        if (!sourceSessionID && schedule.agent_id) {
          const src = await Session.ensureMainSession(schedule.agent_id)
          sourceSessionID = src.id
        }
        if (!sourceSessionID) {
          log.warn("schedule delegate: cannot resolve source session", { id: schedule.id })
          return
        }

        // Resolve target session (where the message will be delivered)
        let targetSession: any
        if (params.session_id) {
          targetSession = await Session.get(params.session_id)
          if (!targetSession) { log.warn("schedule delegate: target session not found", { id: schedule.id }); return }
        } else if (resolvedAgentID && params.session_type) {
          targetSession = await Session.createNext({
            directory: process.cwd(),
            title: params.title ?? params.description ?? `Scheduled (@${resolvedAgentID})`,
            sessionType: params.session_type,
            agentID: resolvedAgentID,
            ownerKind: "service",
          })
        } else if (resolvedAgentID) {
          targetSession = await Session.ensureMainSession(resolvedAgentID)
        } else {
          log.warn("schedule delegate: no agent or session_id in params", { id: schedule.id })
          return
        }

        // Inject a synthetic assistant message into the source session to surface
        // the delegate tool call in the UI. No parent user message needed.
        const now = Date.now()
        const cwd = process.cwd()

        const assistantMsg: MessageV2.Assistant = {
          id: Identifier.ascending("message"),
          sessionID: sourceSessionID,
          role: "assistant",
          from: { kind: "agent", id: resolvedAgentID ?? "schedule" },
          agent: resolvedAgentID ?? "schedule",
          mode: resolvedAgentID ?? "schedule",
          modelID: "schedule",
          providerID: "schedule",
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          path: { cwd, root: cwd },
          time: { created: now },
        }
        await Session.updateMessage(assistantMsg)

        // Keep a reference to the part data — we need the same fields for the status update later.
        // Don't rely on Session.updatePart's return value, which may not include all fields.
        const toolPartData = {
          id: Identifier.ascending("part"),
          messageID: assistantMsg.id,
          sessionID: sourceSessionID,
          type: "tool" as const,
          callID: Identifier.ascending("part"),
          tool: "delegate",
          state: {
            status: "running" as const,
            input: params,
            metadata: {},
            time: { start: now },
          },
        }
        await Session.updatePart(toolPartData as any)

        // Pre-generate the posted message ID so we know it upfront without
        // parentSessionID/parentMessageID wire the posted message back to this tool call.
        const start = Date.now()
        let postedMessageId: string | undefined
        let error: string | undefined
        try {
          const posted = await SessionPrompt.prompt({
            sessionID: targetSession.id,
            ...(resolvedAgentID ? { agent: resolvedAgentID } : {}),
            noWait: !(params.wait ?? false),
            parentMessageID: assistantMsg.id,
            parts: await SessionPrompt.resolvePromptParts(params.prompt),
          })
          postedMessageId = (posted as any).info.id
        } catch (e: any) {
          error = e?.message ?? String(e)
        }

        const completedState = error
          ? { status: "error", input: params, error, metadata: {}, time: { start, end: Date.now() } }
          : {
              status: "completed",
              input: params,
              output: "message posted",
              metadata: {
                sessionId: targetSession.id,
                messageId: postedMessageId,
                agent: resolvedAgentID,
              },
              title: params.description ?? `Delegate → ${resolvedAgentID ?? targetSession.id}`,
              time: { start, end: Date.now() },
            }
        try {
          await Session.updatePart({ ...toolPartData, state: completedState } as any)
        } catch (updateErr: any) {
          log.error("scheduler delegate: failed to finalize tool part", {
            err: updateErr?.message,
            state: JSON.stringify(completedState),
          })
        }

        await Session.updateMessage({ ...assistantMsg, time: { ...assistantMsg.time, completed: Date.now() } })
        return
      }

      // Default: message action — send text to the schedule's own session/agent
      let sessionID = schedule.session_id
      if (!sessionID && schedule.agent_id) {
        const session = await Session.ensureMainSession(schedule.agent_id)
        sessionID = session.id
      }
      if (!sessionID) {
        log.warn("schedule has no session or agent, skipping", { id: schedule.id })
        return
      }
      await SessionPrompt.prompt({
        sessionID,
        parts: [{ type: "text", text: schedule.prompt }],
      })
    }

    const args = {
      hostname: opts.hostname,
      idleTimeout: 0,
      fetch: App().fetch,
      websocket: websocket,
    } as const
    const tryServe = (port: number) => {
      try {
        return Bun.serve({ ...args, port })
      } catch {
        return undefined
      }
    }
    const server = opts.port === 0 ? (tryServe(4096) ?? tryServe(0)) : tryServe(opts.port)
    if (!server) throw new Error(`Failed to start server on port ${opts.port}`)

    _url = server.url

    // Eagerly seed agents on startup so PERSONA.md files exist before first UI load
    Agent.list().catch(() => {})

    // Start PingPong session infrastructure
    BusBridge.start()
    retentionDaemon.start(sessionManager, openDoraStorageAdapter)
    
    // Cron fires outside any HTTP context so it needs its own Instance.provide wrapper.
    const cronDispatch: ScheduleDispatchFn = async (schedule) => {
      await Instance.provide({
        directory: process.cwd(),
        init: InstanceBootstrap,
        async fn() {
          await _scheduleDispatch(schedule)
        },
      })
    }

    // Start Cron Scheduler Loop
    const cronManager = new CronScheduler(Database.Client(), cronDispatch)
    cronManager.start()

    const shouldPublishMDNS =
      opts.mdns &&
      server.port &&
      opts.hostname !== "127.0.0.1" &&
      opts.hostname !== "localhost" &&
      opts.hostname !== "::1"
    if (shouldPublishMDNS) {
      MDNS.publish(server.port!, opts.mdnsDomain)
    } else if (opts.mdns) {
      log.warn("mDNS enabled but hostname is loopback; skipping mDNS publish")
    }

    const originalStop = server.stop.bind(server)
    server.stop = async (closeActiveConnections?: boolean) => {
      cronManager.stop()
      if (shouldPublishMDNS) MDNS.unpublish()
      retentionDaemon.stop()
      BusBridge.stop()
      return originalStop(closeActiveConnections)
    }

    return server
  }
}
