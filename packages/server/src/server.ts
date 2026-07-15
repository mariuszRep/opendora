import { BusEvent } from "@projectflows/util/bus-event"
import { Bus } from "@projectflows/runtime/bus"
import { Log } from "@projectflows/util/log"
import { describeRoute, generateSpecs, validator, resolver, openAPIRouteHandler } from "hono-openapi"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { proxy } from "hono/proxy"
import { basicAuth } from "hono/basic-auth"
import z from "zod"
import { Provider } from "@projectflows/provider/provider"
import { NamedError } from "@projectflows/util/error"
import { LSP } from "./lsp"
import { Format } from "@projectflows/runtime/format"
import { TuiRoutes } from "./routes/tui"
import { Instance } from "@projectflows/runtime/instance"
import { Vcs } from "@projectflows/runtime/vcs"
import { Skill } from "@projectflows/skills/skill"
import { Auth } from "@projectflows/auth"
import { Flag } from "@projectflows/util/flag"
import { Command } from "@projectflows/server/command"
import { Global } from "@projectflows/util/global"
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
import { WorkflowRoutes } from "@projectflows/workflow/routes"
import { registerToolExecutor, runWorkflow } from "@projectflows/workflow/runner"
import { WorkflowStorage } from "@projectflows/workflow/storage"
import { CheckpointStore } from "@projectflows/workflow/checkpoint-store"
import { CronScheduler, type ScheduleDispatchFn } from "@projectflows/schedule/cron-scheduler"
import { Schedule } from "@projectflows/schedule/service"
import { Database } from "@projectflows/storage/db"
import { Agent } from "@projectflows/runtime/agent"
import { ToolRegistry } from "@projectflows/server/tool-registry"
import { lazy } from "@projectflows/util/lazy"
import { InstanceBootstrap } from "@projectflows/runtime/bootstrap"
import { NotFoundError } from "@projectflows/storage/db"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { websocket, serveStatic } from "hono/bun"
import { join, dirname } from "node:path"
import { existsSync } from "node:fs"
import { HTTPException } from "hono/http-exception"
import { errors } from "./error"
import { QuestionRoutes } from "./routes/question"
import { PermissionRoutes } from "./routes/permission"
import { GlobalRoutes } from "./routes/global"
import { VoiceRoutes } from "./routes/voice"
import { AuthRoutes } from "./routes/auth"
import { UserRoutes } from "./routes/user"
import { GeneralRoutes, getGlobalTimezone } from "./routes/general"
import { UsageRoutes } from "./routes/usage"
import { MemoryRoutes } from "./routes/memory"
import { PluginRoutes } from "./routes/plugin"
import { EntityRoutes } from "./routes/entity"
import { CatalogRoutes } from "./routes/catalog"
import { MDNS } from "./mdns"
import { BusBridge } from "@projectflows/session/bus-bridge"
import { retentionDaemon, sessionManager } from "@projectflows/session/session"
import { configureSessionCore } from "./configure-session-core"
import { projectflowsStorageAdapter } from "@projectflows/session/storage-adapter"
import { Session } from "@projectflows/session/session"
import { migrateAllSessions } from "@projectflows/session"
import { Identifier } from "@projectflows/util/id"
import { MessageV2 } from "@projectflows/session/message"
import { createWorkflowToolExecutor } from "./workflow-tool-executor"

// @ts-ignore This global is needed to prevent ai-sdk from logging warnings to stdout https://github.com/vercel/ai/blob/2dc67e0ef538307f21368db32d5a12345d98831b/packages/ai/src/logger/log-warnings.ts#L85
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace Server {
  const log = Log.create({ service: "server" })

  let _url: URL | undefined
  let _corsWhitelist: string[] = []
  let _webDir: string | undefined
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
          const password = Flag.PROJECTFLOWS_SERVER_PASSWORD
          if (!password) return next()
          const username = Flag.PROJECTFLOWS_SERVER_USERNAME ?? "projectflows"
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
              // Allow private/LAN dev origins (covers WSL2 IPs like 10.255.255.254
              // and standard RFC1918 ranges) so the dev UI works whether loaded
              // from localhost or the WSL/LAN address.
              if (/^https?:\/\/(10|172\.(1[6-9]|2\d|3[01])|192\.168)\.[0-9.]+(:\d+)?$/.test(input)) return input
              if (
                input === "tauri://localhost" ||
                input === "http://tauri.localhost" ||
                input === "https://tauri.localhost"
              )
                return input

              // *.projectflows.ai (https only, adjust if needed)
              if (/^https:\/\/([a-z0-9-]+\.)*projectflows\.ai$/.test(input)) {
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
            await Instance.disposeAll().catch(() => undefined)
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
            await Instance.disposeAll().catch(() => undefined)
            return c.json(true)
          },
        )
        .get(
          "/auth/:providerID",
          describeRoute({
            summary: "Get auth status",
            description: "Check whether authentication credentials are configured for a provider",
            operationId: "auth.status",
            responses: {
              200: {
                description: "Auth status",
                content: {
                  "application/json": {
                    schema: resolver(z.object({ configured: z.boolean() })),
                  },
                },
              },
            },
          }),
          validator(
            "param",
            z.object({
              providerID: z.string(),
            }),
          ),
          async (c) => {
            const { providerID } = c.req.valid("param")
            const info = await Auth.get(providerID)
            return c.json({ configured: info !== null })
          },
        )
        .get("/health", (c) => c.json({ ok: true }))
        .use(async (c, next) => {
          if (c.req.path === "/log") return next()
          const raw = c.req.query("directory") || c.req.header("x-projectflows-directory") || process.env.PROJECTFLOWS_PROJECT_ROOT || process.cwd()
          const directory = (() => {
            try {
              return decodeURIComponent(raw)
            } catch {
              return raw
            }
          })()
          return Instance.provide({
            directory,
            init: async () => { await LSP.init(); await InstanceBootstrap() },
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
                title: "projectflows",
                version: "0.0.3",
                description: "projectflows api",
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
        .route("/workflow", WorkflowRoutes())
        .post("/workflow/checkpoint-flush", async (c) => {
          const flushed = await CheckpointStore.flushAll()
          return c.json({ flushed })
        })
        .route("/voice", VoiceRoutes())
        .route("/user", UserRoutes())
        .route("/general", GeneralRoutes())
        .route("/usage", UsageRoutes())
        .route("/memory", MemoryRoutes())
        .route("/plugin", PluginRoutes())
        .route("/entity", EntityRoutes())
        .route("/catalog", CatalogRoutes())
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
            await Skill.reload()
            const skills = await Skill.all()
            return c.json(skills)
          },
        )
        .post(
          "/skill",
          describeRoute({
            summary: "Create skill",
            description: "Create a new local skill with a SKILL.md and skill.json.",
            operationId: "app.skill.create",
            responses: {
              201: {
                description: "Created",
                content: { "application/json": { schema: resolver(Skill.Info) } },
              },
            },
          }),
          validator(
            "json",
            z.object({
              name: z.string(),
              description: z.string(),
              tools: z.array(z.string()).optional(),
              content: z.string().optional(),
            }),
          ),
          async (c) => {
            const body = c.req.valid("json")
            await Skill.create(body)
            const skill = await Skill.get(body.name)
            return c.json(skill, 201)
          },
        )
        .put(
          "/skill",
          describeRoute({
            summary: "Save skill content",
            description: "Write updated content to a skill's SKILL.md file.",
            operationId: "app.skill.save",
            responses: {
              200: {
                description: "Saved",
                content: { "application/json": { schema: resolver(z.boolean()) } },
              },
            },
          }),
          validator("json", z.object({ location: z.string(), content: z.string() })),
          async (c) => {
            const { location, content } = c.req.valid("json")
            await Skill.save(location, content)
            return c.json(true)
          },
        )
        .get(
          "/skill/:name",
          describeRoute({
            summary: "Get skill",
            description: "Get a single skill by name, including tools from skill.json.",
            operationId: "app.skill.get",
            responses: {
              200: {
                description: "Skill info",
                content: { "application/json": { schema: resolver(Skill.Info) } },
              },
            },
          }),
          validator("param", z.object({ name: z.string() })),
          async (c) => {
            const { name } = c.req.valid("param")
            await Skill.reload()
            const skill = await Skill.get(name)
            if (!skill) return c.json({ error: `skill "${name}" not found` }, 404)
            return c.json(skill)
          },
        )
        .patch(
          "/skill/:name/config",
          describeRoute({
            summary: "Update skill config",
            description: "Update skill.json for a skill (tools, description).",
            operationId: "app.skill.config.update",
            responses: {
              200: {
                description: "Updated",
                content: { "application/json": { schema: resolver(z.boolean()) } },
              },
            },
          }),
          validator("param", z.object({ name: z.string() })),
          validator(
            "json",
            z.object({
              tools: z.array(z.string()).optional(),
            }),
          ),
          async (c) => {
            const { name } = c.req.valid("param")
            const patch = c.req.valid("json")
            await Skill.saveConfig(name, patch)
            return c.json(true)
          },
        )
        .delete(
          "/skill/:name",
          describeRoute({
            summary: "Delete skill",
            description: "Remove a skill's directory from disk.",
            operationId: "app.skill.delete",
            responses: {
              200: {
                description: "Deleted",
                content: { "application/json": { schema: resolver(z.boolean()) } },
              },
            },
          }),
          validator("param", z.object({ name: z.string() })),
          async (c) => {
            const { name } = c.req.valid("param")
            await Skill.remove(name)
            return c.json(true)
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

              // Coalesce consecutive message.part.delta events for the same part into
              // one SSE write every FLUSH_MS, so a fast-streaming response doesn't send
              // one network frame per token. Other event types are written immediately,
              // after flushing any pending delta first to preserve ordering.
              const FLUSH_MS = 33
              // accDelta/lastSeq are subscriber-local — never mutate the shared Bus payload object.
              let pending: { event: any; accDelta: string; lastSeq: number; timer: ReturnType<typeof setTimeout> } | null = null

              // Serialise all SSE writes so a flushed delta always arrives at the
              // client before the non-delta event that follows it.
              let writeQueue: Promise<void> = Promise.resolve()
              function enqueue(write: () => Promise<void>): void {
                writeQueue = writeQueue.then(write).catch(() => {})
              }

              function flushPending() {
                if (!pending) return
                clearTimeout(pending.timer)
                const { event, accDelta, lastSeq } = pending
                pending = null
                const flushedEvent = {
                  ...event,
                  properties: { ...event.properties, delta: accDelta, seq: lastSeq },
                }
                enqueue(() => stream.writeSSE({ data: JSON.stringify(flushedEvent) }))
              }

              const unsub = Bus.subscribeAll((event) => {
                if (event.type !== "message.part.delta") {
                  flushPending()
                  enqueue(() => stream.writeSSE({ data: JSON.stringify(event) }))
                  if (event.type === Bus.InstanceDisposed.type) {
                    writeQueue = writeQueue.then(() => stream.close()).catch(() => {})
                  }
                  return
                }
                const props = event.properties
                if (pending && pending.event.properties.partID === props.partID) {
                  clearTimeout(pending.timer)
                  pending.accDelta += props.delta
                  pending.lastSeq = props.seq ?? pending.lastSeq
                } else {
                  flushPending()
                  pending = { event, accDelta: props.delta, lastSeq: props.seq ?? 0, timer: null as any }
                }
                pending.timer = setTimeout(flushPending, FLUSH_MS)
              })

              // Send heartbeat every 10s to prevent stalled proxy streams.
              const heartbeat = setInterval(() => {
                flushPending()
                enqueue(() =>
                  stream.writeSSE({
                    data: JSON.stringify({
                      type: "server.heartbeat",
                      properties: {},
                    }),
                  }),
                )
              }, 10_000)

              await new Promise<void>((resolve) => {
                stream.onAbort(() => {
                  flushPending()
                  clearInterval(heartbeat)
                  unsub()
                  resolve()
                  log.info("event disconnected")
                })
              })
            })
          },
        )
        .use("/*", (c, next) => {
          if (!_webDir) return next()
          return serveStatic({ root: _webDir })(c, next)
        })
        .get("/*", (c, next) => {
          if (!_webDir) return next()
          return serveStatic({ root: _webDir, path: "/index.html" })(c, next)
        })
        .all("/*", async (c) => {
          const path = c.req.path

          const response = await proxy(`https://app.projectflows.ai${path}`, {
            ...c.req,
            headers: {
              ...c.req.raw.headers,
              host: "app.projectflows.ai",
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
          title: "projectflows",
          version: "1.0.0",
          description: "projectflows api",
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
    webDir?: string
  }) {
    // Resolve web asset directory: explicit opt -> env var -> adjacent to binary -> extracted global web -> unset.
    _webDir = (() => {
      if (opts.webDir) return opts.webDir
      if (process.env.PROJECTFLOWS_WEB_DIR) return process.env.PROJECTFLOWS_WEB_DIR
      const adjacent = join(dirname(process.execPath), "web")
      if (existsSync(join(adjacent, "index.html"))) return adjacent
      const globalWeb = join(Global.Path.share, "web")
      if (existsSync(join(globalWeb, "index.html"))) return globalWeb
      return undefined
    })()

    configureSessionCore()
    registerToolExecutor(createWorkflowToolExecutor())

    // Clear out any tool parts left in pending/running state by a previous
    // process that was killed mid-stream — otherwise the UI shows them stuck
    // at "Pending" forever with no way to approve, dismiss, or retry.
    Session.reconcileInterruptedToolParts().catch((err) => {
      log.warn("reconcileInterruptedToolParts failed", { error: err instanceof Error ? err.message : String(err) })
    })

    // Backfill reply edges for any existing sessions that pre-date the graph ledger.
    // Idempotent — sessions with edges already are skipped.
    migrateAllSessions().catch((err) => {
      log.warn("graph-migration backfill failed", { error: err instanceof Error ? err.message : String(err) })
    })
    _corsWhitelist = opts.cors ?? []

    // Define before App() is called so the route captures the real function, not the no-op.
    _scheduleDispatch = async (schedule) => {
      if (!schedule.workflow_id) {
        log.warn("schedule has no workflow_id, skipping", { id: schedule.id })
        return
      }

      // Resolve source session (where the synthetic tool call appears in the UI)
      let sourceSessionID: string | undefined = schedule.session_id ?? undefined
      if (sourceSessionID) {
        try { await Session.get(sourceSessionID) } catch { sourceSessionID = undefined }
      }
      if (!sourceSessionID && schedule.agent_id) {
        const src = await Session.ensureMainSession(schedule.agent_id)
        sourceSessionID = src.id
      }

      // Inject a synthetic assistant message with a workflow_run tool part (if source session known)
      const now = Date.now()
      const cwd = process.cwd()
      let assistantMsg: MessageV2.Assistant | undefined
      let toolPartData: any | undefined

      if (sourceSessionID) {
        assistantMsg = {
          id: Identifier.ascending("message"),
          sessionID: sourceSessionID,
          role: "assistant",
          from: { kind: "scheduler", id: schedule.agent_id ?? "schedule" },
          agent: schedule.agent_id ?? "schedule",
          mode: schedule.agent_id ?? "schedule",
          modelID: "schedule",
          providerID: "schedule",
          schedule_id: schedule.id,
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          path: { cwd, root: cwd },
          time: { created: now },
        }
        await Session.updateMessage(assistantMsg)

        toolPartData = {
          id: Identifier.ascending("part"),
          messageID: assistantMsg.id,
          sessionID: sourceSessionID,
          type: "tool" as const,
          callID: Identifier.ascending("part"),
          tool: "workflow_run",
          state: {
            status: "running" as const,
            input: { workflowId: schedule.workflow_id, input: schedule.workflow_input ?? undefined },
            metadata: {},
            time: { start: now },
          },
        }
        await Session.updatePart(toolPartData as any)
      }

      // Get workflow_run tool from registry and build a synthetic execution context
      await ToolRegistry.init()
      const toolInfo = ToolRegistry.all().find((t) => t.id === "workflow_run")
      const srcSession = sourceSessionID
        ? await Session.get(sourceSessionID).catch(() => undefined)
        : undefined
      const sessionDirectory = srcSession?.directory ?? Instance.directory

      const start = Date.now()
      let error: string | undefined

      if (!toolInfo) {
        error = "workflow_run tool is not installed — install the workflows tool group from the catalog"
        log.warn("schedule: workflow_run tool not found in registry", { id: schedule.id })
      } else {
        const toolDef = await toolInfo.init({})
        const execCtx = {
          sessionID: sourceSessionID ?? `schedule-${schedule.id}`,
          messageID: "schedule-workflow-runner",
          agent: schedule.agent_id ?? "",
          abort: new AbortController().signal,
          messages: [],
          metadata: (_input: any) => {},
          ask: async (_input: any) => {},
          extra: {
            directory: sessionDirectory,
            worktree: Instance.worktree,
            agents: {
              list: () => Agent.list(),
              get: (id: string) => Agent.get(id),
            },
            session: {
              list: (filter?: any) => Session.list(filter),
              get: (id: string) => Session.get(id),
              messages: (id: string) => Session.messages({ sessionID: id }),
              setTitle: (id: string, title: string) => Session.setTitle({ sessionID: id, title }),
              createNext: (input: any) => Session.createNext(input),
              setCwd: (input: { sessionID: string; cwd: string }) => Session.setCwd(input),
              ensureMainSession: (agentID: string) => Session.ensureMainSession(agentID),
            },
            workflow: {
              get: (id: string) => WorkflowStorage.get(undefined, id),
              availableIds: () => WorkflowStorage.availableIds(undefined),
              run: (workflow: any, sessionId: string, input: Record<string, unknown>, directory: string) =>
                runWorkflow({ workflow, sessionId, input, directory }),
            },
          },
        }

        // Pass workflow_input as-is — workflow_run's Zod schema accepts a JSON string and auto-parses it
        try {
          await toolDef.execute(
            {
              workflowId: schedule.workflow_id,
              input: schedule.workflow_input ?? undefined,
              agentId: schedule.agent_id ?? undefined,
            },
            execCtx as any,
          )
        } catch (err: any) {
          error = err?.message ?? String(err)
          log.error("schedule workflow: execution failed", { id: schedule.id, error })
        }
      }

      // Finalize the synthetic tool part
      if (assistantMsg && toolPartData && sourceSessionID) {
        const finalState = error
          ? { status: "error", input: toolPartData.state.input, error, metadata: {}, time: { start, end: Date.now() } }
          : {
              status: "completed",
              input: toolPartData.state.input,
              output: "workflow started",
              metadata: { workflowId: schedule.workflow_id },
              title: `Workflow → ${schedule.workflow_id}`,
              time: { start, end: Date.now() },
            }
        try {
          await Session.updatePart({ ...toolPartData, state: finalState } as any)
        } catch (updateErr: any) {
          log.error("schedule: failed to finalize tool part", { err: updateErr?.message })
        }
        await Session.updateMessage({ ...assistantMsg, time: { ...assistantMsg.time, completed: Date.now() } })
      }
    }
    Schedule.setDispatch(_scheduleDispatch)


    const args = {
      hostname: opts.hostname,
      idleTimeout: 0,
      fetch: App().fetch,
      websocket: websocket,
    } as const
    let _serveError: unknown
    const tryServe = (port: number) => {
      try {
        return Bun.serve({ ...args, port })
      } catch (err) {
        _serveError = err
        log.error("failed to bind port", { port, err: String(err) })
        return undefined
      }
    }
    const server = opts.port === 0 ? (tryServe(4096) ?? tryServe(0)) : tryServe(opts.port)
    if (!server) {
      const reason = _serveError instanceof Error ? _serveError.message : String(_serveError ?? "unknown")
      throw new Error(`Failed to start server on port ${opts.port}: ${reason}`)
    }

    _url = server.url

    // Eagerly seed agents on startup so PERSONA.md files exist before first UI load
    Agent.list().catch(() => {})

    // Start PingPong session infrastructure
    BusBridge.start()
    retentionDaemon.start(sessionManager, projectflowsStorageAdapter)
    
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
    const cronManager = new CronScheduler(Database.Client(), cronDispatch, getGlobalTimezone)
    cronManager.start()

    // Start Browser Control Server (computed string prevents bundler from tracing playwright-core into the CLI binary)
    const browserModule = "@projectflows/tools/browser"
    import(browserModule)
      .then((mod: any) => mod.startBrowserControlServiceFromConfig())
      .then(() => log.info("Browser control server started"))
      .catch((error) => log.warn(`Failed to start browser control server: ${error}`))

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
