import { APICallError } from "ai"
import { STATUS_CODES } from "http"
import { iife } from "@projectflows/util/iife"

export namespace ProviderError {
  /**
   * Semantic classification of provider errors.
   * Drives cooldown duration and fallback eligibility — not just HTTP status codes.
   */
  export type ErrorKind =
    | "quota"      // 429: rate limit / quota exhausted — use API reset time or 2 h default
    | "auth"       // 401, 403: auth failure — 24 h cooldown, user action required
    | "not_found"  // 404: model/endpoint not found — 24 h cooldown
    | "invalid"    // 400, 413: bad request — 5 min cooldown (possibly transient)
    | "unavailable" // 502, 503, 529: service temporarily down — 10 min cooldown
    | "server"     // 500: internal server error — 15 min cooldown
    | "overflow"   // context length exceeded — no cooldown, fallback won't help

  /** Default cooldown duration per error kind (milliseconds). */
  export const COOLDOWN_BY_KIND: Record<ErrorKind, number> = {
    quota:       2 * 60 * 60 * 1000,  // 2 h (usually overridden by API reset header)
    auth:       24 * 60 * 60 * 1000,  // 24 h — credentials need fixing
    not_found:  24 * 60 * 60 * 1000,  // 24 h — model simply doesn't exist here
    invalid:     5 * 60 * 1000,       // 5 min — request may be transient
    unavailable: 10 * 60 * 1000,      // 10 min — brief outage
    server:      15 * 60 * 1000,      // 15 min — recoverable server error
    overflow:    0,                    // N/A — not a provider issue
  }

  /**
   * Whether an error kind should trigger trying the next slot in a fallback group.
   * All kinds are eligible except overflow — context size is a user problem, not a
   * provider problem, so switching providers won't help.
   */
  export function isFallbackEligible(kind: ErrorKind): boolean {
    return kind !== "overflow"
  }

  /** Map HTTP status code (and optional message) to an ErrorKind. */
  export function classifyErrorKind(statusCode?: number, message?: string): ErrorKind {
    if (message && isOverflow(message)) return "overflow"
    switch (statusCode) {
      case 401:
      case 403: return "auth"
      case 404: return "not_found"
      case 400:
      case 413: return "invalid"
      case 402: // Payment Required — quota/credits exhausted (e.g. OpenRouter, Kilo)
      case 429: return "quota"
      case 500: return "server"
      case 502:
      case 503:
      case 529: return "unavailable"
    }
    // Unknown or missing status — check message for quota signals before defaulting
    if (message && /insufficient.quota|out.of.credits|quota.exceeded|payment.required/i.test(message)) {
      return "quota"
    }
    return "server"
  }
  // Adapted from overflow detection patterns in:
  // https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/utils/overflow.ts
  const OVERFLOW_PATTERNS = [
    /prompt is too long/i, // Anthropic
    /input is too long for requested model/i, // Amazon Bedrock
    /exceeds the context window/i, // OpenAI (Completions + Responses API message text)
    /input token count.*exceeds the maximum/i, // Google (Gemini)
    /maximum prompt length is \d+/i, // xAI (Grok)
    /reduce the length of the messages/i, // Groq
    /maximum context length is \d+ tokens/i, // OpenRouter, DeepSeek
    /exceeds the limit of \d+/i, // GitHub Copilot
    /exceeds the available context size/i, // llama.cpp server
    /greater than the context length/i, // LM Studio
    /context window exceeds limit/i, // MiniMax
    /exceeded model token limit/i, // Kimi For Coding, Moonshot
    /context[_ ]length[_ ]exceeded/i, // Generic fallback
  ]

  function isOpenAiErrorRetryable(e: APICallError) {
    const status = e.statusCode
    if (!status) return e.isRetryable
    // openai sometimes returns 404 for models that are actually available
    return status === 404 || e.isRetryable
  }

  // Providers not reliably handled in this function:
  // - z.ai: can accept overflow silently (needs token-count/context-window checks)
  function isOverflow(message: string) {
    if (OVERFLOW_PATTERNS.some((p) => p.test(message))) return true

    // Providers/status patterns handled outside of regex list:
    // - Cerebras: often returns "400 (no body)" / "413 (no body)"
    // - Mistral: often returns "400 (no body)" / "413 (no body)"
    return /^4(00|13)\s*(status code)?\s*\(no body\)/i.test(message)
  }

  function error(providerID: string, error: APICallError) {
    if (providerID.includes("github-copilot") && error.statusCode === 403) {
      return "Please reauthenticate with the copilot provider to ensure your credentials work properly with OpenCode."
    }

    return error.message
  }

  function message(providerID: string, e: APICallError) {
    return iife(() => {
      const msg = e.message
      if (msg === "") {
        if (e.responseBody) return e.responseBody
        if (e.statusCode) {
          const err = STATUS_CODES[e.statusCode]
          if (err) return err
        }
        return "Unknown error"
      }

      const transformed = error(providerID, e)
      if (transformed !== msg) {
        return transformed
      }
      if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
        return msg
      }

      try {
        const body = JSON.parse(e.responseBody)
        // try to extract common error message fields
        const errMsg = body.message || body.error || body.error?.message
        if (errMsg && typeof errMsg === "string") {
          return `${msg}: ${errMsg}`
        }
      } catch {}

      return `${msg}: ${e.responseBody}`
    }).trim()
  }

  function json(input: unknown) {
    if (typeof input === "string") {
      try {
        const result = JSON.parse(input)
        if (result && typeof result === "object") return result
        return undefined
      } catch {
        return undefined
      }
    }
    if (typeof input === "object" && input !== null) {
      return input
    }
    return undefined
  }

  export type ParsedStreamError =
    | {
        type: "context_overflow"
        errorKind: "overflow"
        message: string
        responseBody: string
      }
    | {
        type: "api_error"
        errorKind: ErrorKind
        message: string
        isRetryable: false
        responseBody: string
      }

  export function parseStreamError(input: unknown): ParsedStreamError | undefined {
    const body = json(input)
    if (!body) return

    const responseBody = JSON.stringify(body)
    if (body.type !== "error") return

    switch (body?.error?.code) {
      case "context_length_exceeded":
        return {
          type: "context_overflow",
          errorKind: "overflow" as const,
          message: "Input exceeds context window of this model",
          responseBody,
        }
      case "insufficient_quota":
        return {
          type: "api_error",
          errorKind: "quota" as const,
          message: "Quota exceeded. Check your plan and billing details.",
          isRetryable: false,
          responseBody,
        }
      case "usage_not_included":
        return {
          type: "api_error",
          errorKind: "quota" as const,
          message: "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
          isRetryable: false,
          responseBody,
        }
      case "invalid_prompt":
        return {
          type: "api_error",
          errorKind: "invalid" as const,
          message: typeof body?.error?.message === "string" ? body?.error?.message : "Invalid prompt.",
          isRetryable: false,
          responseBody,
        }
    }
  }

  export type ParsedAPICallError =
    | {
        type: "context_overflow"
        errorKind: "overflow"
        message: string
        responseBody?: string
      }
    | {
        type: "api_error"
        errorKind: ErrorKind
        message: string
        statusCode?: number
        isRetryable: boolean
        responseHeaders?: Record<string, string>
        responseBody?: string
        metadata?: Record<string, string>
      }

  /**
   * OpenCode Zen's router can return HTTP 401 with a structured ModelError body
   * ("No provider available") when no upstream provider is available for the model.
   * This is a transient capacity issue, not a credential failure — the structured
   * body must override the status code so it's classified as retryable server overload
   * instead of a hard auth failure.
   */
  function isOpenCodeZenModelUnavailable(providerID: string, error: APICallError): boolean {
    if (!providerID.startsWith("opencode")) return false
    if (error.statusCode !== 401) return false
    const body = json(error.responseBody)
    return !!body && body.type === "error" && body.error?.type === "ModelError" && body.error?.message === "No provider available"
  }

  export function parseAPICallError(input: { providerID: string; error: APICallError }): ParsedAPICallError {
    const m = message(input.providerID, input.error)
    if (isOverflow(m)) {
      return {
        type: "context_overflow",
        errorKind: "overflow",
        message: m,
        responseBody: input.error.responseBody,
      }
    }

    const modelUnavailable = isOpenCodeZenModelUnavailable(input.providerID, input.error)
    const metadata = input.error.url ? { url: input.error.url } : undefined
    return {
      type: "api_error",
      errorKind: modelUnavailable ? "server" : classifyErrorKind(input.error.statusCode, m),
      message: m,
      statusCode: input.error.statusCode,
      isRetryable: modelUnavailable
        ? true
        : input.providerID.startsWith("openai")
          ? isOpenAiErrorRetryable(input.error)
          : input.error.isRetryable,
      responseHeaders: input.error.responseHeaders,
      responseBody: input.error.responseBody,
      metadata,
    }
  }
}
