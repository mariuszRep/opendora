import type { NamedError } from "@projectflows/util/error"
import { MessageV2 } from "./message-v2"

// Inline iife utility
function iife<T>(fn: () => T): T {
  return fn()
}

// Google API type URLs for structured error details
const GOOGLE_RPC_RETRY_INFO = "type.googleapis.com/google.rpc.RetryInfo"
const GOOGLE_RPC_ERROR_INFO = "type.googleapis.com/google.rpc.ErrorInfo"

const CLOUDCODE_DOMAINS = [
  "cloudcode-pa.googleapis.com",
  "staging-cloudcode-pa.googleapis.com",
  "autopush-cloudcode-pa.googleapis.com",
]

interface GoogleErrorDetail {
  "@type": string
  [key: string]: unknown
}

interface RetryInfoDetail extends GoogleErrorDetail {
  "@type": typeof GOOGLE_RPC_RETRY_INFO
  retryDelay?: string // e.g. "34.074824224s", "900ms"
}

interface ErrorInfoDetail extends GoogleErrorDetail {
  "@type": typeof GOOGLE_RPC_ERROR_INFO
  reason?: string
  domain?: string
}

/**
 * Parses a protobuf duration string (e.g. "34.074824224s", "900ms") to milliseconds.
 */
function parseDurationMs(duration: string): number | null {
  if (duration.endsWith("ms")) {
    const ms = parseFloat(duration.slice(0, -2))
    return isNaN(ms) ? null : ms
  }
  if (duration.endsWith("s")) {
    const s = parseFloat(duration.slice(0, -1))
    return isNaN(s) ? null : s * 1000
  }
  return null
}

/**
 * Parses the Google API error details array from a raw response body string.
 * Returns null if the body is not a well-formed Google API error.
 */
function parseGoogleErrorDetails(responseBody: string | undefined): GoogleErrorDetail[] | null {
  if (!responseBody) return null
  try {
    const parsed = JSON.parse(responseBody)
    const details = parsed?.error?.details
    if (Array.isArray(details) && details.length > 0) return details
  } catch {}
  return null
}

/**
 * Checks if a domain belongs to the Google Cloud Code API.
 * Sanitizes stray characters that SSE stream parsing can inject.
 */
function isCloudCodeDomain(domain: string): boolean {
  const sanitized = domain.replace(/[^a-zA-Z0-9.-]/g, "")
  return CLOUDCODE_DOMAINS.includes(sanitized)
}

/**
 * Checks if this is a terminal (non-retryable) quota error from the CloudCode API.
 * QUOTA_EXHAUSTED means a hard limit (daily/total), not a per-minute rate limit.
 * MODEL_CAPACITY_EXHAUSTED is a server-side fleet capacity signal — retrying won't help.
 */
export function isTerminalQuotaError(responseBody: string | undefined): boolean {
  const details = parseGoogleErrorDetails(responseBody)
  if (!details) return false
  const errorInfo = details.find((d): d is ErrorInfoDetail => d["@type"] === GOOGLE_RPC_ERROR_INFO)
  if (!errorInfo?.domain || !isCloudCodeDomain(errorInfo.domain)) return false
  return errorInfo.reason === "QUOTA_EXHAUSTED" || errorInfo.reason === "MODEL_CAPACITY_EXHAUSTED"
}

export namespace SessionRetry {
  export const RETRY_INITIAL_DELAY = 2000
  export const RETRY_BACKOFF_FACTOR = 2
  export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
  export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout
  // Matches Gemini CLI: delays longer than 5 min are treated as terminal
  export const MAX_RETRYABLE_DELAY_MS = 300_000
  // Maximum number of retry attempts before giving up
  export const MAX_RETRY_ATTEMPTS = 1

  export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const abortHandler = () => {
        clearTimeout(timeout)
        reject(new DOMException("Aborted", "AbortError"))
      }
      const timeout = setTimeout(
        () => {
          signal.removeEventListener("abort", abortHandler)
          resolve()
        },
        Math.min(ms, RETRY_MAX_DELAY),
      )
      signal.addEventListener("abort", abortHandler, { once: true })
    })
  }

  function clampDelay(ms: number): number {
    return Math.min(ms, MAX_RETRYABLE_DELAY_MS)
  }

  export function delay(attempt: number, error?: MessageV2.APIError) {
    if (error) {
      const headers = error.data.responseHeaders

      // 1. Standard HTTP retry-after headers — returned as-is (no clamping).
      //    retryable() already treats delays > MAX_RETRYABLE_DELAY_MS as terminal.
      if (headers) {
        const retryAfterMs = headers["retry-after-ms"]
        if (retryAfterMs) {
          const parsedMs = Number.parseFloat(retryAfterMs)
          if (!Number.isNaN(parsedMs)) return parsedMs
        }

        const retryAfter = headers["retry-after"]
        if (retryAfter) {
          const parsedSeconds = Number.parseFloat(retryAfter)
          if (!Number.isNaN(parsedSeconds)) return Math.ceil(parsedSeconds * 1000)
          const parsed = Date.parse(retryAfter) - Date.now()
          if (!Number.isNaN(parsed) && parsed > 0) return Math.ceil(parsed)
        }

        // Codex-specific: x-codex-primary-reset-after-seconds
        const codexResetAfter = headers["x-codex-primary-reset-after-seconds"]
        if (codexResetAfter) {
          const seconds = Number.parseFloat(codexResetAfter)
          if (!Number.isNaN(seconds) && seconds > 0) return Math.ceil(seconds * 1000)
        }

        // Codex-specific: x-codex-primary-reset-at (Unix timestamp in seconds)
        const codexResetAt = headers["x-codex-primary-reset-at"]
        if (codexResetAt) {
          const ts = Number.parseFloat(codexResetAt) * 1000
          const delayMs = ts - Date.now()
          if (!Number.isNaN(ts) && delayMs > 0) return Math.ceil(delayMs)
        }
      }

      // 2. Google structured error details: RetryInfo.retryDelay (protobuf duration string)
      //    This is the canonical source used by the Gemini CLI.
      const details = parseGoogleErrorDetails(error.data.responseBody)
      if (details) {
        const retryInfo = details.find((d): d is RetryInfoDetail => d["@type"] === GOOGLE_RPC_RETRY_INFO)
        if (retryInfo?.retryDelay) {
          const ms = parseDurationMs(retryInfo.retryDelay)
          if (ms !== null) return clampDelay(ms + 1000) // +1s buffer
        }

        // 3. CloudCode RATE_LIMIT_EXCEEDED with no RetryInfo: default to 10s (matches Gemini CLI)
        const errorInfo = details.find((d): d is ErrorInfoDetail => d["@type"] === GOOGLE_RPC_ERROR_INFO)
        if (errorInfo?.domain && isCloudCodeDomain(errorInfo.domain) && errorInfo.reason === "RATE_LIMIT_EXCEEDED") {
          // 4. But first try to parse "reset after Ns" from the message — more precise than 10s default
          const msgMatch = (error.data.message ?? "").match(/reset after (\d+(?:\.\d+)?)s/i)
          if (msgMatch) {
            const ms = parseFloat(msgMatch[1]!) * 1000
            if (!isNaN(ms)) return clampDelay(Math.ceil(ms) + 1000) // +1s buffer
          }
          return 10_000
        }
      }

      // 5. Fallback message parse for non-structured responses: "Please retry in Xs" (Gemini CLI pattern)
      //    and "reset after Ns" (CloudCode free-tier pattern)
      const message = error.data.message ?? ""
      const retryInMatch = message.match(/Please retry in ([0-9.]+(?:ms|s))/i)
      if (retryInMatch?.[1]) {
        const ms = parseDurationMs(retryInMatch[1])
        if (ms !== null) return clampDelay(Math.ceil(ms) + 1000)
      }

      const resetMatch = message.match(/reset after (\d+(?:\.\d+)?)s/i)
      if (resetMatch) {
        const ms = parseFloat(resetMatch[1]!) * 1000
        if (!isNaN(ms)) return clampDelay(Math.ceil(ms) + 1000)
      }

      // 6. Exponential backoff if we had headers but nothing matched
      if (headers) {
        return RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1)
      }
    }

    return Math.min(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1), RETRY_MAX_DELAY_NO_HEADERS)
  }

  export function retryable(error: ReturnType<InstanceType<typeof NamedError>["toObject"]>) {
    if (MessageV2.ContextOverflowError.isInstance(error)) return undefined
    if (MessageV2.APIError.isInstance(error)) {
      if (!error.data.isRetryable) return undefined
      // QUOTA_EXHAUSTED from CloudCode is a hard limit — not retryable
      if (isTerminalQuotaError(error.data.responseBody)) return undefined
      // FreeUsageLimitError requires user action (add credits) — not retryable
      if (error.data.responseBody?.includes("FreeUsageLimitError")) return undefined
      // Codex usage_limit_reached — not retryable, wait for reset window
      if (error.data.responseBody?.includes("usage_limit_reached")) return undefined
      // Check retry-after header: delays longer than MAX_RETRYABLE_DELAY_MS are terminal
      const retryAfterSec = error.data.responseHeaders?.["retry-after"]
      if (retryAfterSec) {
        const seconds = Number.parseFloat(retryAfterSec)
        if (!Number.isNaN(seconds) && seconds * 1000 > MAX_RETRYABLE_DELAY_MS) return undefined
      }
      // Check Codex reset headers: delays longer than MAX_RETRYABLE_DELAY_MS are terminal
      const codexResetAfter = error.data.responseHeaders?.["x-codex-primary-reset-after-seconds"]
      if (codexResetAfter) {
        const seconds = Number.parseFloat(codexResetAfter)
        if (!Number.isNaN(seconds) && seconds * 1000 > MAX_RETRYABLE_DELAY_MS) return undefined
      }
      return error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message
    }

    const json = iife(() => {
      try {
        if (typeof error.data?.message === "string") {
          return JSON.parse(error.data.message)
        }
        return JSON.parse(error.data.message)
      } catch {
        return undefined
      }
    })
    try {
      if (!json || typeof json !== "object") return undefined
      const code = typeof json.code === "string" ? json.code : ""

      if (json.type === "error" && json.error?.type === "too_many_requests") {
        return "Too Many Requests"
      }
      if (code.includes("exhausted") || code.includes("unavailable")) {
        return "Provider is overloaded"
      }
      if (json.type === "error" && json.error?.code?.includes("rate_limit")) {
        return "Rate Limited"
      }
      return JSON.stringify(json)
    } catch {
      return undefined
    }
  }
}
