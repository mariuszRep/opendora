import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Config } from "../../config/config"
import { Provider } from "@opendora/provider/provider"
import { ModelsDev } from "@opendora/provider/models"
import { ProviderAuth } from "@opendora/provider/auth"
import { Auth } from "../../auth"
import { ProviderFallback } from "@opendora/provider/fallback"
import { ProviderTimeout } from "@opendora/provider/timeout"
import { ProviderUsageFile } from "@opendora/session/token-usage-file"
import { mapValues } from "remeda"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Log } from "../../util/log"
import { Installation } from "../../installation"

const log = Log.create({ service: "provider.routes" })

// Codex models fetched from the live API, refreshed on startup and hourly.
// Kept at module level so the route handler never blocks on a network call.
type CodexModel = Record<string, unknown>
let codexModelsCache: Record<string, CodexModel> | null = null

async function refreshCodexModels() {
  const auth = await Auth.get("openai-codex")
  if (!auth || auth.type !== "oauth") {
    codexModelsCache = null
    return
  }
  const headers = new Headers({
    authorization: `Bearer ${auth.access}`,
    "User-Agent": Installation.USER_AGENT,
  })
  if (auth.accountId) headers.set("ChatGPT-Account-Id", auth.accountId)
  const url = new URL("https://chatgpt.com/backend-api/codex/models")
  const version = Installation.VERSION
  url.searchParams.set("client_version", /^\d+\.\d+\.\d+/.test(version) ? version : "0.0.0")
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
    if (!response.ok) {
      log.warn("codex models refresh failed", { status: response.status })
      return
    }
    const payload = await response.json() as {
      models: Array<{ slug: string; display_name: string; context_window?: number; visibility?: string; supported_in_api?: boolean }>
    }
    const models: Record<string, CodexModel> = {}
    for (const model of payload.models ?? []) {
      if (model.visibility === "hide" || model.supported_in_api === false) continue
      models[model.slug] = {
        id: model.slug,
        name: model.display_name || model.slug,
        providerID: "openai-codex",
        api: { id: model.slug, url: "https://chatgpt.com/backend-api/codex", npm: "@ai-sdk/openai" },
        cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
        limit: {
          context: model.context_window ?? 400_000,
          input: Math.floor((model.context_window ?? 400_000) * 0.68),
          output: Math.min(128_000, Math.floor((model.context_window ?? 400_000) * 0.32)),
        },
        capabilities: { temperature: false, reasoning: true, attachment: false, toolcall: true },
        status: "active",
        options: {},
        headers: {},
        release_date: "",
        variants: {},
      }
    }
    codexModelsCache = models
    log.info("codex models refreshed", { count: Object.keys(models).length })
  } catch (error) {
    log.warn("codex models refresh failed", { error })
  }
}

// Refresh once on startup and then every hour, same cadence as models.dev
refreshCodexModels().catch(() => {})
setInterval(() => refreshCodexModels().catch(() => {}), 60 * 60 * 1000).unref()

export const ProviderRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List providers",
        description: "Get a list of all available AI providers, including both available and connected ones.",
        operationId: "provider.list",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    all: ModelsDev.Provider.array(),
                    default: z.record(z.string(), z.string()),
                    connected: z.array(z.string()),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const [config, allProviders, connected, authMethodMap, liveAuth] = await Promise.all([
          Config.get(),
          ModelsDev.get(),
          Provider.list(),
          ProviderAuth.methods(),
          Auth.all(),
        ])

        ProviderFallback.setCustomGroups(
          (config.model_groups ?? []).map((g) => ({
            id: g.id,
            displayName: g.name,
            slots: g.models,
          })),
        )

        const disabled = new Set(config.disabled_providers ?? [])
        const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined

        const filteredProviders: Record<string, (typeof allProviders)[string]> = {}
        for (const [key, value] of Object.entries(allProviders)) {
          if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
            filteredProviders[key] = value
          }
        }

        const providers = Object.assign(
          mapValues(filteredProviders, (x) => Provider.fromModelsDevProvider(x)),
          connected,
        )

        if (providers["opencode"] && !providers["opencode-private"]) {
          providers["opencode-private"] = {
            ...providers["opencode"],
            id: "opencode-private",
            name: "OpenCode Zen (API key)",
            env: ["OPENCODE_PRIVATE_API_KEY", "OPENCODE_ZEN_API_KEY"],
            models: mapValues(providers["opencode"].models, (model: any) => ({
              ...model,
              providerID: "opencode-private",
            })),
          } as any
        }

        // Merge Codex API cache with models.dev openai-codex models.
        // Codex API models act as placeholders for models not yet in models.dev.
        // models.dev metadata takes priority when both sources have the same model ID.
        if (providers["openai-codex"] && codexModelsCache) {
          const merged: Record<string, any> = { ...codexModelsCache }
          for (const [id, model] of Object.entries(providers["openai-codex"].models)) {
            merged[id] = model
          }
          providers["openai-codex"].models = merged
        }

        authMethodMap["opencode-private"] ??= [{ type: "api", label: "Enter OpenCode Zen API key" }]

        // Inject synthetic provider entries for plugins with auth methods not yet in the list
        for (const [providerID, methods] of Object.entries(authMethodMap)) {
          if (!providers[providerID] && methods.length > 0) {
            const name =
              providerID === "google-gemini-cli"
                ? "Google Gemini CLI"
                : providerID
                    .split("-")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ")
            providers[providerID] = {
              id: providerID,
              name,
              env: [],
              models: {},
              source: "custom",
              options: {},
            } as any
          }
        }

        // Supplement connected with fresh auth data (bypasses cached Provider.state)
        for (const [providerID] of Object.entries(liveAuth)) {
          if (authMethodMap[providerID] && !connected[providerID] && providers[providerID]) {
            connected[providerID] = providers[providerID]
          }
        }

        // Inject synthetic "fallback" provider for cross-provider free model groups
        const connectedSet = new Set(Object.keys(connected))
        const fallbackModels: Record<string, any> = {}
        for (const group of ProviderFallback.allGroups()) {
          const connectedSlots = group.slots.filter((s) => connectedSet.has(s.providerID))
          if (connectedSlots.length < 2) continue
          fallbackModels[group.id] = {
            id: group.id,
            name: `${group.displayName} ↔ ${connectedSlots.length} providers`,
            tool_call: true,
            reasoning: true,
            attachment: false,
            release_date: "",
            cost: { input: 0, output: 0 },
            limit: { context: 204800, output: 32000 },
            options: {},
            modalities: { input: ["text"], output: ["text"] },
          }
        }
        if (Object.keys(fallbackModels).length > 0) {
          const fallbackProvider: any = {
            id: "fallback",
            name: "Free Fallback Groups",
            env: [],
            models: fallbackModels,
          }
          providers["fallback"] = fallbackProvider
          connected["fallback"] = fallbackProvider
        }

        return c.json({
          all: Object.values(providers),
          default: mapValues(providers, (item) => Provider.sort(Object.values(item.models))[0]?.id ?? ""),
          connected: Object.keys(connected),
        })
      },
    )
    .get(
      "/timeout",
      describeRoute({
        summary: "Get provider timeout status",
        description: "Get timeout status for all providers that have been rate-limited.",
        operationId: "provider.timeout",
        responses: {
          200: {
            description: "Provider timeout statuses",
            content: {
              "application/json": {
                schema: resolver(
                  z.record(z.string(), z.object({
                    timedOut: z.boolean(),
                    until: z.number().nullable(),
                    reason: z.string().nullable(),
                    resetInSeconds: z.number().nullable(),
                    failedModels: z.array(z.string()),
                  })),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const info = await ProviderTimeout.allTimeoutInfo()
        return c.json(info)
      },
    )
    .get(
      "/usage",
      describeRoute({
        summary: "Get provider rate-limit usage",
        description: "Get the latest rate-limit window state for all providers, used by the UI to display quota progress bars.",
        operationId: "provider.usage",
        responses: {
          200: {
            description: "Per-provider usage state",
            content: {
              "application/json": {
                schema: resolver(
                  z.record(
                    z.string(),
                    z.object({
                      version: z.literal(1),
                      providerID: z.string(),
                      updatedAt: z.number(),
                      models: z.record(
                        z.string(),
                        z.object({
                          updatedAt: z.number(),
                          requests_limit: z.number().nullable().optional(),
                          requests_used: z.number().nullable().optional(),
                          requests_remaining: z.number().nullable().optional(),
                          requests_reset_at: z.number().nullable().optional(),
                          tokens_limit: z.number().nullable().optional(),
                          tokens_used: z.number().nullable().optional(),
                          tokens_remaining: z.number().nullable().optional(),
                          tokens_reset_at: z.number().nullable().optional(),
                        }),
                      ),
                    }),
                  ),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        const usage = ProviderUsageFile.readAll()
        return c.json(usage)
      },
    )
    .get(
      "/auth",
      describeRoute({
        summary: "Get provider auth methods",
        description: "Retrieve available authentication methods for all AI providers.",
        operationId: "provider.auth",
        responses: {
          200: {
            description: "Provider auth methods",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), z.array(ProviderAuth.Method))),
              },
            },
          },
        },
      }),
      async (c) => {
        const methods = await ProviderAuth.methods()
        methods["opencode-private"] ??= [{ type: "api", label: "Enter OpenCode Zen API key" }]
        return c.json(methods)
      },
    )
    .post(
      "/:providerID/oauth/authorize",
      describeRoute({
        summary: "OAuth authorize",
        description: "Initiate OAuth authorization for a specific AI provider to get an authorization URL.",
        operationId: "provider.oauth.authorize",
        responses: {
          200: {
            description: "Authorization URL and method",
            content: {
              "application/json": {
                schema: resolver(ProviderAuth.Authorization.optional()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: z.string().meta({ description: "Provider ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          method: z.number().meta({ description: "Auth method index" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const { method } = c.req.valid("json")
        const result = await ProviderAuth.authorize({
          providerID,
          method,
        })
        return c.json(result)
      },
    )
    .post(
      "/:providerID/oauth/callback",
      describeRoute({
        summary: "OAuth callback",
        description: "Handle the OAuth callback from a provider after user authorization.",
        operationId: "provider.oauth.callback",
        responses: {
          200: {
            description: "OAuth callback processed successfully",
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
          providerID: z.string().meta({ description: "Provider ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          method: z.number().meta({ description: "Auth method index" }),
          code: z.string().optional().meta({ description: "OAuth authorization code" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const { method, code } = c.req.valid("json")
        await ProviderAuth.callback({
          providerID,
          method,
          code,
        })
        return c.json(true)
      },
    )
    .post(
      "/:providerID/oauth/refresh",
      describeRoute({
        summary: "OAuth refresh",
        description: "Refresh OAuth tokens for a provider using the stored refresh token.",
        operationId: "provider.oauth.refresh",
        responses: {
          200: {
            description: "Token refresh successful",
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
          providerID: z.string().meta({ description: "Provider ID" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const result = await ProviderAuth.refresh({
          providerID,
        })
        return c.json(result)
      },
    )
    .delete(
      "/:providerID/timeout",
      describeRoute({
        summary: "Clear provider timeout",
        description: "Clear the timeout for a specific provider, allowing it to be used again.",
        operationId: "provider.timeout.clear",
        responses: {
          200: {
            description: "Timeout cleared successfully",
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
          providerID: z.string().meta({ description: "Provider ID" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        await ProviderTimeout.clearTimeout(providerID)
        return c.json(true)
      },
    )
)
