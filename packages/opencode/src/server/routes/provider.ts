import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Config } from "../../config/config"
import { Provider } from "@opendora/provider/provider"
import { ModelsDev } from "@opendora/provider/models"
import { ProviderAuth } from "@opendora/provider/auth"
import { Auth } from "../../auth"
import { FallbackManager } from "@opendora/session/fallback"
import { mapValues } from "remeda"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

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
        const config = await Config.get()
        const disabled = new Set(config.disabled_providers ?? [])
        const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined

        const allProviders = await ModelsDev.get()
        const filteredProviders: Record<string, (typeof allProviders)[string]> = {}
        for (const [key, value] of Object.entries(allProviders)) {
          if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
            filteredProviders[key] = value
          }
        }

        const connected = await Provider.list()
        const providers = Object.assign(
          mapValues(filteredProviders, (x) => Provider.fromModelsDevProvider(x)),
          connected,
        )

        // Inject synthetic provider entries for plugins with auth methods not yet in the list
        const authMethodMap = await ProviderAuth.methods()
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
        const liveAuth = await Auth.all()
        for (const [providerID] of Object.entries(liveAuth)) {
          if (authMethodMap[providerID] && !connected[providerID] && providers[providerID]) {
            connected[providerID] = providers[providerID]
          }
        }

        // Inject synthetic "fallback" provider for cross-provider free model groups
        const connectedSet = new Set(Object.keys(connected))
        const fallbackModels: Record<string, any> = {}
        for (const group of FallbackManager.allGroups()) {
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
        return c.json(await ProviderAuth.methods())
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
    ),
)
