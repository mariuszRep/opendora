import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { GoogleOAuth } from "./google-oauth"

const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com"
const CODE_ASSIST_API_VERSION = "v1internal"
const OAUTH_DUMMY_KEY = "google-gemini-cli-oauth-dummy"

// Models available through Google Code Assist (gemini-cli)
// Matches: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/models.ts
const GEMINI_CLI_MODELS: Record<string, { name: string; reasoning: boolean; preview?: boolean }> = {
  "gemini-3.1-pro-preview": { name: "Gemini 3.1 Pro Preview", reasoning: true, preview: true },
  "gemini-3-flash-preview": { name: "Gemini 3 Flash Preview", reasoning: true, preview: true },
  "gemini-2.5-pro": { name: "Gemini 2.5 Pro", reasoning: true },
  "gemini-2.5-flash": { name: "Gemini 2.5 Flash", reasoning: true },
  "gemini-2.5-flash-lite": { name: "Gemini 2.5 Flash Lite", reasoning: false },
}

function buildModels(providerID: string): Record<string, any> {
  const models: Record<string, any> = {}
  for (const [id, info] of Object.entries(GEMINI_CLI_MODELS)) {
    models[id] = {
      id,
      providerID,
      name: info.name,
      family: id.startsWith("gemini-3") ? "gemini-3" : "gemini-2.5",
      api: {
        id,
        url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}`,
        npm: "@ai-sdk/google",
      },
      status: info.preview ? "beta" : "active",
      headers: {},
      options: {},
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context: 1048576, output: 65536 },
      capabilities: {
        temperature: true,
        reasoning: info.reasoning,
        attachment: true,
        toolcall: true,
        input: { text: true, audio: false, image: true, video: false, pdf: true },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
        interleaved: info.reasoning ? { field: "reasoning_details" as const } : false,
      },
      release_date: "2025-01-01",
      variants: {},
    }
  }
  return models
}

export async function googleOAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "google-gemini-cli",
      async loader(getAuth, provider) {
        const auth = await getAuth()
        if (auth?.type !== "oauth") return {}

        // Populate models
        if (provider) {
          provider.models = buildModels("google-gemini-cli")
        }

        // Return dummy API key — the actual fetch/auth/URL-rewriting is handled
        // by the "google-gemini-cli" CUSTOM_LOADER in provider.ts
        return {
          apiKey: OAUTH_DUMMY_KEY,
        }
      },
      methods: [
        {
          type: "oauth",
          label: "Sign in with Google Gemini CLI",
          async authorize(inputs = {}) {
            const flow = await GoogleOAuth.startAuthFlow()

            return {
              url: flow.url,
              method: "auto" as const,
              instructions:
                "Opening your browser for Google authentication.\n" +
                "If the browser does not open automatically, copy and paste this URL:\n\n" +
                flow.url +
                "\n\nWaiting for authentication...",
              async callback() {
                const result = await flow.complete()

                if (!result.refresh_token) {
                  return {
                    type: "failed" as const,
                  }
                }

                return {
                  type: "success" as const,
                  access: result.access_token,
                  refresh: result.refresh_token,
                  expires: result.expiry_date ?? Date.now() + 3600 * 1000,
                  accountId: result.email,
                }
              },
            }
          },
        },
      ],
    },
  }
}
