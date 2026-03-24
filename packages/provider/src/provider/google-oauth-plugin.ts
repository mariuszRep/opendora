import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { GoogleOAuth } from "./google-oauth"

export async function googleOAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "google-gemini-cli",
      async loader(getAuth, provider) {
        const auth = await getAuth()
        if (auth?.type !== "oauth") return {}

        // Customize provider name
        provider.name = "Google Gemini CLI"

        // TODO: Fetch available models from Gemini CLI API if needed
        // Similar to how codex fetches its catalog
        
        return {}
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
