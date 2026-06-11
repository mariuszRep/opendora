import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { Log } from "../util/log"
import { Installation } from "../installation"
import { Auth, OAUTH_DUMMY_KEY } from "@opendora/auth"
import os from "os"
import { Provider } from "@opendora/provider/provider"
import { ProviderTransform } from "@opendora/provider/transform"
import { Bus } from "@opendora/runtime/bus"
import { BusEvent } from "@/bus/bus-event"

const log = Log.create({ service: "plugin.codex" })

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const ISSUER = "https://auth.openai.com"
const CODEX_API_BASE = "https://chatgpt.com/backend-api/codex"
const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"
const CODEX_MODELS_ENDPOINT = "https://chatgpt.com/backend-api/codex/models"
const CODEX_CLIENT_VERSION_FALLBACK = "0.98.0"
const OAUTH_PORT = 1455
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000

interface CodexRemoteModel {
  slug: string
  display_name: string
  description?: string
  visibility?: string
  supported_in_api?: boolean
  supported_reasoning_levels?: Array<{ effort?: string }>
  priority?: number
  context_window?: number
  input_modalities?: string[]
}

interface CodexModelsResponse {
  models: CodexRemoteModel[]
}

function isVisibleCodexModel(model: CodexRemoteModel): boolean {
  return model.visibility !== "hide" && model.supported_in_api !== false
}

function codexModelName(model: CodexRemoteModel): string {
  return model.display_name || model.slug
}

function codexModelLimit(model: CodexRemoteModel): Provider.Model["limit"] {
  const context = model.context_window ?? 400_000
  const input = Math.floor(context * 0.68)
  const output = Math.min(128_000, Math.floor(context * 0.32))
  return {
    context,
    input,
    output,
  }
}

function codexModelCapabilities(model: CodexRemoteModel): Provider.Model["capabilities"] {
  const inputModalities = new Set(model.input_modalities ?? ["text"])
  const reasoning = (model.supported_reasoning_levels ?? []).length > 0
  return {
    temperature: false,
    reasoning,
    attachment: inputModalities.has("image"),
    toolcall: true,
    input: {
      text: true,
      audio: inputModalities.has("audio"),
      image: inputModalities.has("image"),
      video: inputModalities.has("video"),
      pdf: inputModalities.has("file"),
    },
    output: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    interleaved: false,
  }
}

export function codexRemoteModelToProviderModel(model: CodexRemoteModel): Provider.Model {
  const mapped: Provider.Model = {
    id: model.slug,
    providerID: "openai-codex",
    api: {
      id: model.slug,
      url: CODEX_API_BASE,
      npm: "@ai-sdk/openai",
    },
    name: codexModelName(model),
    family: "gpt-codex",
    capabilities: codexModelCapabilities(model),
    cost: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
    limit: codexModelLimit(model),
    status: "active",
    options: {},
    headers: {},
    release_date: "",
    variants: {},
  }
  mapped.variants = ProviderTransform.variants(mapped)
  return mapped
}

export function codexCatalogToProviderModels(models: CodexRemoteModel[]): Record<string, Provider.Model> {
  return Object.fromEntries(
    models
      .filter(isVisibleCodexModel)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((model) => {
        const mapped = codexRemoteModelToProviderModel(model)
        return [mapped.id, mapped]
      }),
  )
}

async function fetchCodexCatalog(accessToken: string, accountId?: string): Promise<Record<string, Provider.Model>> {
  const headers = new Headers({
    authorization: `Bearer ${accessToken}`,
    "User-Agent": Installation.USER_AGENT,
  })
  if (accountId) {
    headers.set("ChatGPT-Account-Id", accountId)
  }

  const url = new URL(CODEX_MODELS_ENDPOINT)
  const version = Installation.VERSION
  url.searchParams.set(
    "client_version",
    /^\d+\.\d+\.\d+/.test(version) ? version : CODEX_CLIENT_VERSION_FALLBACK,
  )

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 401 || response.status === 403) {
    const err = new Error(`Codex models request failed: ${response.status}`) as Error & { authExpired: true }
    err.authExpired = true
    throw err
  }
  if (!response.ok) {
    throw new Error(`Codex models request failed: ${response.status}`)
  }

  const payload = (await response.json()) as CodexModelsResponse
  return codexCatalogToProviderModels(payload.models ?? [])
}

interface PkceCodes {
  verifier: string
  challenge: string
}

async function generatePKCE(): Promise<PkceCodes> {
  const verifier = generateRandomString(43)
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  const challenge = base64UrlEncode(hash)
  return { verifier, challenge }
}

function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("")
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer)
}

export interface IdTokenClaims {
  chatgpt_account_id?: string
  organizations?: Array<{ id: string }>
  email?: string
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string
  }
}

export function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString())
  } catch {
    return undefined
  }
}

export function extractAccountIdFromClaims(claims: IdTokenClaims): string | undefined {
  return (
    claims.chatgpt_account_id ||
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  )
}

export function extractAccountId(tokens: TokenResponse): string | undefined {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token)
    const accountId = claims && extractAccountIdFromClaims(claims)
    if (accountId) return accountId
  }
  if (tokens.access_token) {
    const claims = parseJwtClaims(tokens.access_token)
    return claims ? extractAccountIdFromClaims(claims) : undefined
  }
  return undefined
}

function buildAuthorizeUrl(redirectUri: string, pkce: PkceCodes, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "opencode",
  })
  return `${ISSUER}/oauth/authorize?${params.toString()}`
}

interface TokenResponse {
  id_token: string
  access_token: string
  refresh_token: string
  expires_in?: number
}

async function exchangeCodeForTokens(code: string, redirectUri: string, pkce: PkceCodes): Promise<TokenResponse> {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`)
  }
  return response.json()
}

async function refreshAccessToken(refreshToken: string, signal?: AbortSignal): Promise<TokenResponse> {
  const signals: AbortSignal[] = [AbortSignal.timeout(30_000)]
  if (signal) signals.push(signal)
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
    signal: AbortSignal.any(signals),
  })
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`)
  }
  return response.json()
}

const HTML_SUCCESS = `<!doctype html>
<html>
  <head>
    <title>OpenCode - Codex Authorization Successful</title>
    <style>
      body {
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #131010;
        color: #f1ecec;
      }
      .container {
        text-align: center;
        padding: 2rem;
      }
      h1 {
        color: #f1ecec;
        margin-bottom: 1rem;
      }
      p {
        color: #b7b1b1;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Successful</h1>
      <p>You can close this window and return to OpenCode.</p>
    </div>
    <script>
      setTimeout(() => window.close(), 2000)
    </script>
  </body>
</html>`

const HTML_ERROR = (error: string) => `<!doctype html>
<html>
  <head>
    <title>OpenCode - Codex Authorization Failed</title>
    <style>
      body {
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #131010;
        color: #f1ecec;
      }
      .container {
        text-align: center;
        padding: 2rem;
      }
      h1 {
        color: #fc533a;
        margin-bottom: 1rem;
      }
      p {
        color: #b7b1b1;
      }
      .error {
        color: #ff917b;
        font-family: monospace;
        margin-top: 1rem;
        padding: 1rem;
        background: #3c140d;
        border-radius: 0.5rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Failed</h1>
      <p>An error occurred during authorization.</p>
      <div class="error">${error}</div>
    </div>
  </body>
</html>`

interface PendingOAuth {
  pkce: PkceCodes
  state: string
  resolve: (tokens: TokenResponse) => void
  reject: (error: Error) => void
}

let oauthServer: ReturnType<typeof Bun.serve> | undefined
let pendingOAuth: PendingOAuth | undefined

// ── Module-level state to prevent duplicate work ──────────────────────────

/** Ensure only one background token-refresh loop runs at a time. */
let backgroundRefreshActive = false

/** In-flight token refresh promise — prevents concurrent refresh requests. */
let tokenRefreshInFlight: Promise<TokenResponse> | undefined

/** Short-lived in-memory auth cache to avoid repeated disk reads. */
let authMemoryCache: { data: Record<string, unknown>; expiresAt: number } | undefined
const AUTH_MEMORY_CACHE_TTL_MS = 2_000 // 2 seconds

function invalidateAuthCache() {
  authMemoryCache = undefined
}

async function maybeRefreshCodexTokenOnUnauthorized(
  response: Response,
  currentAuth: any,
  authWithAccount: any,
  init: RequestInit | undefined,
  input: PluginInput,
) {
  if (response.status !== 401) return undefined
  const detail = await response
    .clone()
    .json()
    .then((payload: any) => String(payload?.detail ?? ""))
    .catch(() => "")
  if (!detail.toLowerCase().includes("could not parse your authentication token")) return undefined
  if (!currentAuth?.refresh) return undefined

  log.info("codex token rejected by backend, forcing refresh")
  if (!tokenRefreshInFlight) {
    tokenRefreshInFlight = refreshAccessToken(currentAuth.refresh, init?.signal ?? undefined).finally(() => {
      tokenRefreshInFlight = undefined
    })
  }

  const tokens = await tokenRefreshInFlight
  const newAccountId = extractAccountId(tokens) || authWithAccount.accountId
  await input.client.auth.set({
    path: { id: "openai-codex" },
    body: {
      type: "oauth",
      refresh: tokens.refresh_token,
      access: tokens.access_token,
      expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      ...(newAccountId && { accountId: newAccountId }),
    },
  })
  invalidateAuthCache()
  currentAuth.access = tokens.access_token
  authWithAccount.accountId = newAccountId
  return {
    access: tokens.access_token,
    accountId: newAccountId,
  }
}

async function startOAuthServer(): Promise<{ port: number; redirectUri: string }> {
  if (oauthServer) {
    return { port: OAUTH_PORT, redirectUri: `http://localhost:${OAUTH_PORT}/auth/callback` }
  }

  oauthServer = Bun.serve({
    port: OAUTH_PORT,
    fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === "/auth/callback") {
        const code = url.searchParams.get("code")
        const state = url.searchParams.get("state")
        const error = url.searchParams.get("error")
        const errorDescription = url.searchParams.get("error_description")

        if (error) {
          const errorMsg = errorDescription || error
          pendingOAuth?.reject(new Error(errorMsg))
          pendingOAuth = undefined
          return new Response(HTML_ERROR(errorMsg), {
            headers: { "Content-Type": "text/html" },
          })
        }

        if (!code) {
          const errorMsg = "Missing authorization code"
          pendingOAuth?.reject(new Error(errorMsg))
          pendingOAuth = undefined
          return new Response(HTML_ERROR(errorMsg), {
            status: 400,
            headers: { "Content-Type": "text/html" },
          })
        }

        if (!pendingOAuth || state !== pendingOAuth.state) {
          const errorMsg = "Invalid state - potential CSRF attack"
          pendingOAuth?.reject(new Error(errorMsg))
          pendingOAuth = undefined
          return new Response(HTML_ERROR(errorMsg), {
            status: 400,
            headers: { "Content-Type": "text/html" },
          })
        }

        const current = pendingOAuth
        pendingOAuth = undefined

        exchangeCodeForTokens(code, `http://localhost:${OAUTH_PORT}/auth/callback`, current.pkce)
          .then((tokens) => current.resolve(tokens))
          .catch((err) => current.reject(err))

        return new Response(HTML_SUCCESS, {
          headers: { "Content-Type": "text/html" },
        })
      }

      if (url.pathname === "/cancel") {
        pendingOAuth?.reject(new Error("Login cancelled"))
        pendingOAuth = undefined
        return new Response("Login cancelled", { status: 200 })
      }

      return new Response("Not found", { status: 404 })
    },
  })

  log.info("codex oauth server started", { port: OAUTH_PORT })
  return { port: OAUTH_PORT, redirectUri: `http://localhost:${OAUTH_PORT}/auth/callback` }
}

function stopOAuthServer() {
  if (oauthServer) {
    oauthServer.stop()
    oauthServer = undefined
    log.info("codex oauth server stopped")
  }
}

function waitForOAuthCallback(pkce: PkceCodes, state: string): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        if (pendingOAuth) {
          pendingOAuth = undefined
          reject(new Error("OAuth callback timeout - authorization took too long"))
        }
      },
      5 * 60 * 1000,
    ) // 5 minute timeout

    pendingOAuth = {
      pkce,
      state,
      resolve: (tokens) => {
        clearTimeout(timeout)
        resolve(tokens)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000 // refresh 5 min before expiry

/** Schedule a background token refresh so the token is never stale when switching models.
 *  Only one loop runs at a time across all invocations. */
function scheduleTokenRefresh(getAuth: () => Promise<{ type: string; refresh?: string; expires?: number }>, setAuth: (tokens: TokenResponse, accountId?: string) => Promise<void>) {
  if (backgroundRefreshActive) return
  backgroundRefreshActive = true

  const refresh = async () => {
    try {
      const auth = await getAuth().catch(() => null)
      if (!auth || auth.type !== "oauth" || !auth.refresh) return

      const now = Date.now()
      const expiresAt = auth.expires ?? now + 3600 * 1000
      const timeUntilExpiry = expiresAt - now

      // If token is already expired or will expire soon, refresh immediately
      if (timeUntilExpiry < REFRESH_MARGIN_MS) {
        const tokens = await refreshAccessToken(auth.refresh)
        await setAuth(tokens, (auth as any).accountId)
      } else {
        // Otherwise, schedule refresh for just before expiry
        const delay = Math.max(0, timeUntilExpiry - REFRESH_MARGIN_MS)
        setTimeout(refresh, delay).unref()
      }
    } catch (error: any) {
      log.warn("token refresh failed, will retry on next access", { error })
      backgroundRefreshActive = false
    }
  }

  refresh().catch(() => {})
}

export async function CodexAuthPlugin(input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "openai-codex",
      async loader(getAuth: () => Promise<any>, provider: any) {
        const auth = await getAuth()
        if (auth.type !== "oauth") return {}

        // Rename provider so the UI shows "OpenAI Codex" instead of "OpenAI"
        provider.name = "OpenAI Codex"
        const authWithAccount = auth as typeof auth & { accountId?: string }
        try {
          const models = await fetchCodexCatalog(auth.access, authWithAccount.accountId)
          if (Object.keys(models).length > 0) {
            provider.models = models
          } else {
            log.warn("codex models endpoint returned no visible codex models")
          }
        } catch (error: any) {
          log.warn("failed to refresh codex models; falling back to bundled models", { error })
          if (error?.authExpired) {
            Bus.publish(BusEvent.ProviderAuthExpired, {
              providerID: "openai-codex",
              providerName: "OpenAI Codex",
            }).catch(() => {})
          }
          for (const modelId of Object.keys(provider.models)) {
            if (!modelId.includes("codex")) delete provider.models[modelId]
          }
        }

        for (const model of Object.values(provider.models) as any[]) {
          model.cost = {
            input: 0,
            output: 0,
            cache: { read: 0, write: 0 },
          }
        }

        const setAuth = async (tokens: TokenResponse, accountId?: string) => {
          await input.client.auth.set({
            path: { id: "openai-codex" },
            body: {
              type: "oauth",
              refresh: tokens.refresh_token,
              access: tokens.access_token,
              expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
              ...(accountId && { accountId }),
            },
          })
          invalidateAuthCache()
        }

        // Proactively refresh the token in the background so it's never stale when switching models
        scheduleTokenRefresh(getAuth, setAuth)

        return {
          apiKey: OAUTH_DUMMY_KEY,
          async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
            // Remove dummy API key authorization header
            if (init?.headers) {
              if (init.headers instanceof Headers) {
                init.headers.delete("authorization")
                init.headers.delete("Authorization")
              } else if (Array.isArray(init.headers)) {
                init.headers = init.headers.filter(([key]) => key.toLowerCase() !== "authorization")
              } else {
                delete init.headers["authorization"]
                delete init.headers["Authorization"]
              }
            }

            // Use short-lived in-memory cache to avoid a disk read per request
            const now = Date.now()
            if (!authMemoryCache || now >= authMemoryCache.expiresAt) {
              authMemoryCache = { data: await getAuth(), expiresAt: now + AUTH_MEMORY_CACHE_TTL_MS }
            }
            const currentAuth = authMemoryCache.data as any
            if (currentAuth.type !== "oauth") return fetch(requestInput, init)

            // Cast to include accountId field
            const authWithAccount = currentAuth as typeof currentAuth & { accountId?: string }

            // Check if token needs refresh — use a shared in-flight promise so concurrent
            // requests don't all independently hit the auth server simultaneously.
            if (!currentAuth.access || currentAuth.expires < Date.now()) {
              if (!tokenRefreshInFlight) {
                log.info("refreshing codex access token")
                tokenRefreshInFlight = refreshAccessToken(currentAuth.refresh, init?.signal ?? undefined).finally(() => {
                  tokenRefreshInFlight = undefined
                })
              } else {
                log.info("waiting for in-flight codex token refresh")
              }
              const tokens = await tokenRefreshInFlight
              const newAccountId = extractAccountId(tokens) || authWithAccount.accountId
              await input.client.auth.set({
                path: { id: "openai-codex" },
                body: {
                  type: "oauth",
                  refresh: tokens.refresh_token,
                  access: tokens.access_token,
                  expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                  ...(newAccountId && { accountId: newAccountId }),
                },
              })
              invalidateAuthCache()
              currentAuth.access = tokens.access_token
              authWithAccount.accountId = newAccountId
            }

            // Build headers
            const headers = new Headers()
            if (init?.headers) {
              if (init.headers instanceof Headers) {
                init.headers.forEach((value, key) => headers.set(key, value))
              } else if (Array.isArray(init.headers)) {
                for (const [key, value] of init.headers) {
                  if (value !== undefined) headers.set(key, String(value))
                }
              } else {
                for (const [key, value] of Object.entries(init.headers)) {
                  if (value !== undefined) headers.set(key, String(value))
                }
              }
            }

            // Set authorization header with access token
            headers.set("authorization", `Bearer ${currentAuth.access}`)

            // Set ChatGPT-Account-Id header for organization subscriptions
            if (authWithAccount.accountId) {
              headers.set("ChatGPT-Account-Id", authWithAccount.accountId)
            }

            // Rewrite URL to Codex endpoint
            const parsed =
              requestInput instanceof URL
                ? requestInput
                : new URL(typeof requestInput === "string" ? requestInput : requestInput.url)
            const url =
              parsed.pathname.includes("/v1/responses") || parsed.pathname.includes("/chat/completions")
                ? new URL(CODEX_API_ENDPOINT)
                : parsed

            const response = await fetch(url, {
              ...init,
              headers,
            })
            const refreshed = await maybeRefreshCodexTokenOnUnauthorized(response, currentAuth, authWithAccount, init, input)
            if (!refreshed) return response

            const retryHeaders = new Headers(headers)
            retryHeaders.set("authorization", `Bearer ${refreshed.access}`)
            if (refreshed.accountId) {
              retryHeaders.set("ChatGPT-Account-Id", refreshed.accountId)
            }
            return fetch(url, {
              ...init,
              headers: retryHeaders,
            })
          },
        }
      },
      methods: [
        {
          label: "ChatGPT Pro/Plus (browser)",
          type: "oauth",
          refresh: async (refreshToken: string, _accessToken?: string) => {
            try {
              const tokens = await refreshAccessToken(refreshToken)
              return {
                type: "success" as const,
                refresh: tokens.refresh_token,
                access: tokens.access_token,
                expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                accountId: extractAccountId(tokens),
              }
            } catch (error) {
              return { type: "failed" as const }
            }
          },
          authorize: async () => {
            const { redirectUri } = await startOAuthServer()
            const pkce = await generatePKCE()
            const state = generateState()
            const authUrl = buildAuthorizeUrl(redirectUri, pkce, state)

            const callbackPromise = waitForOAuthCallback(pkce, state)

            return {
              url: authUrl,
              instructions: "Complete authorization in your browser. This window will close automatically.",
              method: "auto" as const,
              callback: async () => {
                const tokens = await callbackPromise
                stopOAuthServer()
                const accountId = extractAccountId(tokens)
                return {
                  type: "success" as const,
                  refresh: tokens.refresh_token,
                  access: tokens.access_token,
                  expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                  accountId,
                }
              },
            }
          },
        },
        {
          label: "ChatGPT Pro/Plus (headless)",
          type: "oauth",
          refresh: async (refreshToken: string, _accessToken?: string) => {
            try {
              const tokens = await refreshAccessToken(refreshToken)
              return {
                type: "success" as const,
                refresh: tokens.refresh_token,
                access: tokens.access_token,
                expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                accountId: extractAccountId(tokens),
              }
            } catch (error) {
              return { type: "failed" as const }
            }
          },
          authorize: async () => {
            const deviceResponse = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": `opencode/${Installation.VERSION}`,
              },
              body: JSON.stringify({ client_id: CLIENT_ID }),
            })

            if (!deviceResponse.ok) throw new Error("Failed to initiate device authorization")

            const deviceData = (await deviceResponse.json()) as {
              device_auth_id: string
              user_code: string
              interval: string
            }
            const interval = Math.max(parseInt(deviceData.interval) || 5, 1) * 1000

            return {
              url: `${ISSUER}/codex/device`,
              instructions: `Enter code: ${deviceData.user_code}`,
              method: "auto" as const,
              async callback() {
                while (true) {
                  const response = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "User-Agent": `opencode/${Installation.VERSION}`,
                    },
                    body: JSON.stringify({
                      device_auth_id: deviceData.device_auth_id,
                      user_code: deviceData.user_code,
                    }),
                  })

                  if (response.ok) {
                    const data = (await response.json()) as {
                      authorization_code: string
                      code_verifier: string
                    }

                    const tokenResponse = await fetch(`${ISSUER}/oauth/token`, {
                      method: "POST",
                      headers: { "Content-Type": "application/x-www-form-urlencoded" },
                      body: new URLSearchParams({
                        grant_type: "authorization_code",
                        code: data.authorization_code,
                        redirect_uri: `${ISSUER}/deviceauth/callback`,
                        client_id: CLIENT_ID,
                        code_verifier: data.code_verifier,
                      }).toString(),
                    })

                    if (!tokenResponse.ok) {
                      throw new Error(`Token exchange failed: ${tokenResponse.status}`)
                    }

                    const tokens: TokenResponse = await tokenResponse.json()

                    return {
                      type: "success" as const,
                      refresh: tokens.refresh_token,
                      access: tokens.access_token,
                      expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
                      accountId: extractAccountId(tokens),
                    }
                  }

                  if (response.status !== 403 && response.status !== 404) {
                    return { type: "failed" as const }
                  }

                  await Bun.sleep(interval + OAUTH_POLLING_SAFETY_MARGIN_MS)
                }
              },
            }
          },
        },
        {
          label: "Manually enter API Key",
          type: "api",
        },
      ],
    },
    "chat.headers": async (input: { model: { providerID: string }; sessionID: string }, output: { headers: Record<string, string> }) => {
      if (input.model.providerID !== "openai-codex") return
      output.headers.originator = "opencode"
      output.headers["User-Agent"] = `opencode/${Installation.VERSION} (${os.platform()} ${os.release()}; ${os.arch()})`
      output.headers.session_id = input.sessionID
    },
  }
}
