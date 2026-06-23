import { BusEvent } from "@opendora/util/bus-event"
import { Bus } from "@opendora/runtime/bus"
import { Log } from "@opendora/util/log"
import { describeRoute, generateSpecs, validator, resolver, openAPIRouteHandler } from "hono-openapi"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { proxy } from "hono/proxy"
import { basicAuth } from "hono/basic-auth"
import z, { toJSONSchema as zodToJSONSchema } from "zod"
import { Provider } from "@opendora/provider/provider"
import { NamedError } from "@opendora/util/error"
import { LSP } from "./lsp"
import { Format } from "@opendora/runtime/format"
import { TuiRoutes } from "./routes/tui"
import { Instance } from "@opendora/runtime/instance"
import { Vcs } from "@opendora/runtime/vcs"
import { Skill } from "@opendora/skills/skill"
import { Auth } from "@opendora/auth"
import { Flag } from "@opendora/util/flag"
import { Command } from "@opendora/server/command"
import { Global } from "@opendora/util/global"
import { ProjectRoutes } from "./routes/project"
import { SessionRoutes } from "./routes/session"
import { PtyRoutes } from "./routes/pty"
import { McpRoutes } from "./routes/mcp"
import { FileRoutes } from "./routes/file"
import { ConfigRoutes } from "./routes/config"
import { ExperimentalRoutes } from "./routes/experimental"
import { ProviderRoutes } from "./routes/provider"
import { startBrowserControlServiceFromConfig, stopBrowserControlService } from "@opendora/tools/browser"
import { AgentRoutes } from "./routes/agent"
import { ScheduleRoutes } from "./routes/schedule"
import { WorkflowRoutes } from "@opendora/workflow/routes"
import { registerToolExecutor } from "@opendora/workflow/runner"
import { addSkillTools, getSkillTools } from "@opendora/session/skill-tools"
import { CronScheduler, type ScheduleDispatchFn } from "@opendora/schedule/cron-scheduler"
import { Schedule } from "@opendora/schedule/service"
import { Database } from "@opendora/storage/db"
import { Agent } from "@opendora/runtime/agent"
import { ToolRegistry } from "@opendora/server/tool-registry"
import { lazy } from "@opendora/util/lazy"
import { InstanceBootstrap } from "@opendora/runtime/bootstrap"
import { NotFoundError } from "@opendora/storage/db"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { websocket } from "hono/bun"
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
import { MDNS } from "./mdns"
import { BusBridge } from "@opendora/session/bus-bridge"
import { retentionDaemon, sessionManager } from "@opendora/session/session"
import { configureSessionCore } from "./configure-session-core"
import { openDoraStorageAdapter } from "@opendora/session/storage-adapter"
import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
import { Identifier } from "@opendora/util/id"
import { generateText, jsonSchema, tool as aiTool } from "ai"
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
        .use(async (c, next) => {
          if (c.req.path === "/log") return next()
          const raw = c.req.query("directory") || c.req.header("x-opencode-directory") || process.env.OPENCODE_PROJECT_ROOT || process.cwd()
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
        .route("/workflow", WorkflowRoutes())
        .route("/voice", VoiceRoutes())
        .route("/user", UserRoutes())
        .route("/general", GeneralRoutes())
        .route("/usage", UsageRoutes())
        .route("/memory", MemoryRoutes())
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
              let pending: { event: any; timer: ReturnType<typeof setTimeout> } | null = null

              // Serialise all SSE writes so a flushed delta always arrives at the
              // client before the non-delta event that follows it.
              let writeQueue: Promise<void> = Promise.resolve()
              function enqueue(write: () => Promise<void>): void {
                writeQueue = writeQueue.then(write).catch(() => {})
              }

              function flushPending() {
                if (!pending) return
                clearTimeout(pending.timer)
                const ev = pending.event
                pending = null
                enqueue(() => stream.writeSSE({ data: JSON.stringify(ev) }))
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
                if (pending && pending.event.properties.partID === event.properties.partID) {
                  clearTimeout(pending.timer)
                  pending.event.properties.delta += event.properties.delta
                } else {
                  flushPending()
                  pending = { event, timer: null as any }
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
    registerToolExecutor(async (toolId, fixedArgs, agentArgs, ctx) => {
      const toolInfo = ToolRegistry.all().find((t) => t.id === toolId)
      if (!toolInfo) throw new Error(`Tool "${toolId}" not found in registry`)

      const initCtx = {
        model: ctx.model ?? { providerID: "fallback", modelID: "fallback" },
      }
      const toolDef = await toolInfo.init(initCtx)

      const session = await Session.get(ctx.sessionID).catch(() => undefined)
      const sessionDirectory = session?.directory ?? Instance.directory

      const execCtx = {
        sessionID: ctx.sessionID,
        messageID: ctx.messageID ?? Identifier.ascending("message"),
        agent: ctx.agent ?? "",
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
                input: finalArgs,
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
          prompt: (opts: any) => SessionPrompt.prompt(opts),
          resolvePromptParts: (template: string) => SessionPrompt.resolvePromptParts(template),
          session: {
            list: (filter?: any) => Session.list(filter),
            get: (id: string) => Session.get(id),
            messages: (id: string) => Session.messages({ sessionID: id }),
            setTitle: (id: string, title: string) => Session.setTitle({ sessionID: id, title }),
            create: (input: any) => Session.create(input),
            ensureMainSession: (agentID: string) => Session.ensureMainSession(agentID),
            setReplyToSessionID: (input: any) => Session.setReplyToSessionID(input),
          },
        },
      }

      let finalArgs = fixedArgs

      if (agentArgs.length > 0) {
        // Semi-deterministic: use one forced LLM call to fill agent-decided params.
        // toolChoice forces the model to return exactly one tool call — no free text.
        const fixedDesc = Object.entries(fixedArgs)
          .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
          .join("\n")
        const agentDesc = agentArgs.join(", ")
        const prompt = [
          `Call the tool \`${toolId}\` now.`,
          fixedArgs && Object.keys(fixedArgs).length > 0
            ? `The following parameters are already decided — use them exactly:\n${fixedDesc}`
            : "",
          `You must determine the value(s) for: ${agentDesc}`,
          `Use the tool immediately.`,
        ].filter(Boolean).join("\n\n")

        const rawSchema = (toolDef as any).parameters
        const isZodSchema = rawSchema?.def !== undefined || rawSchema?._def !== undefined
        const toolSchema = jsonSchema(isZodSchema ? zodToJSONSchema(rawSchema) : (rawSchema ?? {}))

        let language: any
        if (ctx.model) {
          const modelInfo = await Provider.getModel(ctx.model.providerID, ctx.model.modelID)
          language = await Provider.getLanguage(modelInfo)
        } else {
          const session = await Session.get(ctx.sessionID)
          if (session.agentID) {
            const agentCfg = await Agent.get(session.agentID)
            if (agentCfg?.model) {
              const modelInfo = await Provider.getModel(agentCfg.model.providerID, agentCfg.model.modelID)
              language = await Provider.getLanguage(modelInfo)
            }
          }
        }

        if (language) {
          const result = await generateText({
            model: language,
            toolChoice: { type: "tool", toolName: toolId },
            tools: {
              [toolId]: aiTool({
                description: toolDef.description,
                inputSchema: toolSchema,
              }),
            },
            prompt,
          })
          const llmArgs = (result.toolCalls?.[0] as any)?.args ?? {}
          // Fixed args always override LLM-provided values
          finalArgs = { ...llmArgs, ...fixedArgs }
        }
      }

      const result = await toolDef.execute(finalArgs, execCtx)
      return { output: result.output, metadata: result.metadata }
    })

    // Clear out any tool parts left in pending/running state by a previous
    // process that was killed mid-stream — otherwise the UI shows them stuck
    // at "Pending" forever with no way to approve, dismiss, or retry.
    Session.reconcileInterruptedToolParts().catch((err) => {
      log.warn("reconcileInterruptedToolParts failed", { error: err instanceof Error ? err.message : String(err) })
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
      const toolInfo = ToolRegistry.all().find((t) => t.id === "workflow_run")
      if (!toolInfo) {
        log.warn("schedule: workflow_run tool not found in registry", { id: schedule.id })
        return
      }

      const toolDef = await toolInfo.init({})
      const srcSession = sourceSessionID
        ? await Session.get(sourceSessionID).catch(() => undefined)
        : undefined
      const sessionDirectory = srcSession?.directory ?? Instance.directory

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
          },
        },
      }

      // Pass workflow_input as-is — workflow_run's Zod schema accepts a JSON string and auto-parses it
      const start = Date.now()
      let error: string | undefined
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
    const cronManager = new CronScheduler(Database.Client(), cronDispatch, getGlobalTimezone)
    cronManager.start()

    // Start Browser Control Server
    startBrowserControlServiceFromConfig()
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
