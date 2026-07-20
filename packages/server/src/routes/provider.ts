import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Config } from "@projectflows/config/config"
import { Provider } from "@projectflows/provider/provider"
import { ModelsDev } from "@projectflows/provider/models"
import { ProviderAuth } from "@projectflows/provider/auth"
import { Auth } from "@projectflows/auth"
import { ProviderFallback } from "@projectflows/provider/fallback"
import { ProviderTimeout } from "@projectflows/provider/timeout"
import { ProviderUsageFile } from "@projectflows/session/token-usage-file"
import { mapValues } from "remeda"
import { errors } from "../error"
import { lazy } from "@projectflows/util/lazy"
import { Log } from "@projectflows/util/log"
import { Bus } from "@projectflows/runtime/bus"
import { BusEvent } from "@projectflows/util/bus-event"
import { fetchCodexCatalog } from "../plugin/codex"

const log = Log.create({ service: "provider.routes" })

/**
 * models.dev is the catalog authority. Codex discovery is only a complete
 * provider fallback when models.dev has no openai-codex entry; it never merges
 * into or overwrites a models.dev catalog.
 */
async function ensureMissingCodexCatalog(allProviders: Record<string, unknown>) {
  const modelsDevCodex = allProviders["openai-codex"] as { models?: Record<string, unknown> } | undefined
  // models.dev can expose a provider shell before its model records arrive. An
  // empty shell is not a catalog and must not suppress authenticated discovery.
  if (modelsDevCodex && Object.keys(modelsDevCodex.models ?? {}).length > 0) return
  const auth = await Auth.get("openai-codex")
  if (!auth || auth.type !== "oauth") return
  try {
    const models = await fetchCodexCatalog(auth.access, auth.accountId)
    Provider.registerLiveCatalog({
      id: "openai-codex",
      name: "OpenAI Codex",
      source: "api",
      env: [],
      options: {},
      models,
    })
    const wasBlocked = Provider.getAvailability("openai-codex") === "reauthentication_required"
    Provider.setAvailability("openai-codex", "available")
    if (wasBlocked) {
      await Bus.publish(BusEvent.ProviderRecovered, { providerID: "openai-codex", providerName: "OpenAI Codex" })
    }
    log.info("codex fallback catalog refreshed", { count: Object.keys(models).length })
  } catch (error) {
    const authExpired = (error as { authExpired?: boolean }).authExpired
    if (authExpired) {
      const wasBlocked = Provider.getAvailability("openai-codex") === "reauthentication_required"
      Provider.setAvailability("openai-codex", "reauthentication_required")
      if (!wasBlocked) {
        await Bus.publish(BusEvent.ProviderAuthExpired, { providerID: "openai-codex", providerName: "OpenAI Codex" })
      }
    } else if (Provider.getAvailability("openai-codex") === "available") {
      Provider.setAvailability("openai-codex", "stale")
    }
    log.warn("codex fallback catalog refresh failed", { error })
  }
}

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
        const [config, allProviders, authMethodMap, liveAuth] = await Promise.all([
          Config.get(),
          ModelsDev.get(),
          ProviderAuth.methods(),
          Auth.all(),
        ])
        await ensureMissingCodexCatalog(allProviders)
        const connected = await Provider.list()

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

        for (const [providerID, provider] of Object.entries(providers)) {
          const availability = Provider.getAvailability(providerID)
          Object.assign(provider as any, {
            availability,
            models: mapValues((provider as any).models, (model: any) => ({ ...model, availability })),
          })
        }

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
                  z.record(
                    z.string(),
                    z.object({
                      timedOut: z.boolean(),
                      until: z.number().nullable(),
                      reason: z.string().nullable(),
                      resetInSeconds: z.number().nullable(),
                      failedModels: z.array(z.string()),
                      modelCooldowns: z.record(
                        z.string(),
                        z.object({
                          until: z.number(),
                          resetInSeconds: z.number(),
                          reason: z.string(),
                          kind: z.string(),
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
        const info = await ProviderTimeout.allTimeoutInfo()
        return c.json(info)
      },
    )
    .get(
      "/group",
      describeRoute({
        summary: "List group states",
        description: "Get the live slot state for all model groups — which slot is active and which are in cooldown.",
        operationId: "provider.group.list",
        responses: {
          200: {
            description: "Group states",
            content: {
              "application/json": {
                schema: resolver(
                  z.array(
                    z.object({
                      groupID: z.string(),
                      displayName: z.string(),
                      activeSlot: z.object({ providerID: z.string(), modelID: z.string() }).nullable(),
                      slots: z.array(
                        z.object({
                          providerID: z.string(),
                          modelID: z.string(),
                          active: z.boolean(),
                          cooled: z.boolean(),
                          cooldown: z
                            .object({
                              until: z.number(),
                              resetInSeconds: z.number(),
                              reason: z.string(),
                              kind: z.string(),
                            })
                            .nullable(),
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
        const states = await ProviderFallback.allGroupStates()
        return c.json(states)
      },
    )
    .get(
      "/group/:groupID",
      describeRoute({
        summary: "Get group state",
        description: "Get the live slot state for a specific model group.",
        operationId: "provider.group.get",
        responses: {
          200: {
            description: "Group state",
            content: {
              "application/json": {
                schema: resolver(
                  z
                    .object({
                      groupID: z.string(),
                      displayName: z.string(),
                      activeSlot: z.object({ providerID: z.string(), modelID: z.string() }).nullable(),
                      slots: z.array(
                        z.object({
                          providerID: z.string(),
                          modelID: z.string(),
                          active: z.boolean(),
                          cooled: z.boolean(),
                          cooldown: z
                            .object({
                              until: z.number(),
                              resetInSeconds: z.number(),
                              reason: z.string(),
                              kind: z.string(),
                            })
                            .nullable(),
                        }),
                      ),
                    })
                    .nullable(),
                ),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          groupID: z.string().meta({ description: "Group ID" }),
        }),
      ),
      async (c) => {
        const { groupID } = c.req.valid("param")
        const state = await ProviderFallback.getGroupState(groupID)
        return c.json(state)
      },
    )
    .delete(
      "/group/:groupID/cooldown",
      describeRoute({
        summary: "Clear group cooldowns",
        description: "Clear all slot cooldowns for a model group so every slot is eligible again on the next request.",
        operationId: "provider.group.cooldown.clear",
        responses: {
          200: {
            description: "Cooldowns cleared",
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
          groupID: z.string().meta({ description: "Group ID" }),
        }),
      ),
      async (c) => {
        const { groupID } = c.req.valid("param")
        const ok = await ProviderFallback.clearGroupCooldowns(groupID)
        if (!ok) return c.json(false, 400)
        return c.json(true)
      },
    )
    .put(
      "/group/:groupID/slot",
      describeRoute({
        summary: "Set active slot",
        description:
          "Manually promote a specific slot to be the active one for the group, clearing its cooldown if any.",
        operationId: "provider.group.setActiveSlot",
        responses: {
          200: { description: "Slot set", content: { "application/json": { schema: resolver(z.boolean()) } } },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ groupID: z.string() })),
      validator("json", z.object({ providerID: z.string(), modelID: z.string() })),
      async (c) => {
        const { groupID } = c.req.valid("param")
        const slot = c.req.valid("json")
        const ok = await ProviderFallback.setActiveSlot(groupID, slot)
        if (!ok) return c.json(false, 404)
        return c.json(true)
      },
    )
    .get(
      "/usage",
      describeRoute({
        summary: "Get provider rate-limit usage",
        description:
          "Get the latest rate-limit window state for all providers, used by the UI to display quota progress bars.",
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
    ),
)
