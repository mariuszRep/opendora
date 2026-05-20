/**
 * TokenUsage — persists per-LLM-call token and rate-limit data.
 *
 * Each call to an LLM (chat, title, compaction, schedule) writes a row
 * to the `token_usage` table. Rows are soft-linked to sessions/agents/
 * projects (no FK cascade) so they survive deletions.
 */

import { Decimal } from "decimal.js"
import { Identifier } from "@opendora/util/id"
import { getConfig } from "./config.ts"
import { TokenUsageTable } from "./token-usage.sql.ts"

// ─── Public types ────────────────────────────────────────────────────────────

export type Purpose = "chat" | "title" | "compaction" | "schedule" | "tool" | "other"

export interface RecordInput {
  sessionID?: string
  agentID?: string
  projectID?: string
  providerID: string
  modelID: string
  purpose: Purpose
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    reasoning: number
  }
  /** Provider.Model — used for pricing lookup */
  model: any
  /** Raw HTTP response headers (any casing — will be lowercased internally) */
  headers?: Record<string, string> | { entries(): IterableIterator<[string, string]> }
  /** Override: true if this is a free model (actual cost = 0, estimated still computed) */
  isFree?: boolean
}

// ─── Rate-limit header parsing ────────────────────────────────────────────────

interface RateLimitInfo {
  rl_requests_limit:     number | null
  rl_requests_used:      number | null
  rl_requests_remaining: number | null
  rl_requests_reset_at:  number | null
  rl_tokens_limit:       number | null
  rl_tokens_used:        number | null
  rl_tokens_remaining:   number | null
  rl_tokens_reset_at:    number | null
}

/**
 * Parse a rate-limit reset value to epoch-ms.
 * Accepts:
 *   - "42s"  / "42ms"        (relative offset from now)
 *   - ISO date string        (absolute timestamp)
 *   - plain integer string   (treated as epoch-ms when > 1e10, else seconds)
 */
function parseResetToMs(value: string): number | null {
  if (!value) return null
  // "Xs" or "Xms"
  const relMatch = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value.trim())
  if (relMatch) {
    const n = parseFloat(relMatch[1])
    const unit = relMatch[2]
    return Math.floor(Date.now() + (unit === "ms" ? n : n * 1000))
  }
  // ISO date (contains "T" or "-")
  if (value.includes("T") || /^\d{4}-/.test(value)) {
    const ms = Date.parse(value)
    return isNaN(ms) ? null : ms
  }
  // Plain number
  const n = parseFloat(value)
  if (isNaN(n)) return null
  // If the number looks like an epoch-ms (> year-2001 in ms), use as-is
  return n > 1e12 ? Math.floor(n) : Math.floor(Date.now() + n * 1000)
}

function int(v: string | undefined | null): number | null {
  if (v == null) return null
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

export function parseRateLimitHeaders(
  raw: Record<string, string> | { entries(): IterableIterator<[string, string]> } | undefined | null,
): RateLimitInfo {
  const none: RateLimitInfo = {
    rl_requests_limit:     null,
    rl_requests_used:      null,
    rl_requests_remaining: null,
    rl_requests_reset_at:  null,
    rl_tokens_limit:       null,
    rl_tokens_used:        null,
    rl_tokens_remaining:   null,
    rl_tokens_reset_at:    null,
  }
  if (!raw) return none

  // Normalise to a plain lowercase-keyed map
  const h: Record<string, string> = {}
  if (typeof (raw as any).entries === "function") {
    for (const [k, v] of (raw as { entries(): IterableIterator<[string, string]> }).entries()) h[k.toLowerCase()] = v
  } else {
    for (const [k, v] of Object.entries(raw as Record<string, string>)) h[k.toLowerCase()] = v
  }

  const result: RateLimitInfo = { ...none }

  // ─── OpenAI / OpenRouter / Kilo style ────────────────────────────────────
  result.rl_requests_limit     = int(h["x-ratelimit-limit-requests"])
  result.rl_requests_remaining = int(h["x-ratelimit-remaining-requests"])
  result.rl_tokens_limit       = int(h["x-ratelimit-limit-tokens"])
  result.rl_tokens_remaining   = int(h["x-ratelimit-remaining-tokens"])

  // "used" header (not all providers emit it — fall back to limit - remaining)
  if (h["x-ratelimit-used-requests"] != null) {
    result.rl_requests_used = int(h["x-ratelimit-used-requests"])
  } else if (result.rl_requests_limit != null && result.rl_requests_remaining != null) {
    result.rl_requests_used = result.rl_requests_limit - result.rl_requests_remaining
  }
  if (h["x-ratelimit-used-tokens"] != null) {
    result.rl_tokens_used = int(h["x-ratelimit-used-tokens"])
  } else if (result.rl_tokens_limit != null && result.rl_tokens_remaining != null) {
    result.rl_tokens_used = result.rl_tokens_limit - result.rl_tokens_remaining
  }

  // Reset times
  if (h["x-ratelimit-reset-requests"]) {
    result.rl_requests_reset_at = parseResetToMs(h["x-ratelimit-reset-requests"])
  }
  if (h["x-ratelimit-reset-tokens"]) {
    result.rl_tokens_reset_at = parseResetToMs(h["x-ratelimit-reset-tokens"])
  }

  // ─── Codex style ─────────────────────────────────────────────────────────
  if (h["x-codex-primary-reset-at"]) {
    const ts = Date.parse(h["x-codex-primary-reset-at"])
    if (!isNaN(ts)) {
      result.rl_requests_reset_at ??= ts
      result.rl_tokens_reset_at   ??= ts
    }
  }
  if (h["x-codex-primary-reset-after-seconds"]) {
    const secs = parseFloat(h["x-codex-primary-reset-after-seconds"])
    if (!isNaN(secs)) {
      const ts = Math.floor(Date.now() + secs * 1000)
      result.rl_requests_reset_at ??= ts
      result.rl_tokens_reset_at   ??= ts
    }
  }

  // ─── Standard retry-after (fallback for 429 responses) ───────────────────
  if (h["retry-after"]) {
    const parsed = parseResetToMs(h["retry-after"])
    result.rl_requests_reset_at ??= parsed
  }

  return result
}

// ─── Cost calculation ─────────────────────────────────────────────────────────

function computeCost(tokens: RecordInput["tokens"], model: any): number {
  const safe = (n: number) => (Number.isFinite(n) ? n : 0)
  const cost = model?.cost
  const costInfo =
    cost?.experimentalOver200K && tokens.input + tokens.cacheRead > 200_000
      ? cost.experimentalOver200K
      : cost

  return safe(
    new Decimal(0)
      .add(new Decimal(safe(tokens.input)).mul(costInfo?.input ?? 0).div(1_000_000))
      .add(new Decimal(safe(tokens.output)).mul(costInfo?.output ?? 0).div(1_000_000))
      .add(new Decimal(safe(tokens.cacheRead)).mul(costInfo?.cache?.read ?? 0).div(1_000_000))
      .add(new Decimal(safe(tokens.cacheWrite)).mul(costInfo?.cache?.write ?? 0).div(1_000_000))
      .add(new Decimal(safe(tokens.reasoning)).mul(costInfo?.output ?? 0).div(1_000_000))
      .toNumber(),
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

export namespace TokenUsage {
  /**
   * Record a single LLM call.
   * Fire-and-forget — errors are caught and logged so callers are never blocked.
   */
  export async function record(input: RecordInput): Promise<void> {
    try {
      const db = getConfig().db
      if (!db) return

      const estimatedCost = computeCost(input.tokens, input.model)

      const isFreeModel =
        input.isFree === true ||
        (input.model?.cost?.input === 0 && input.model?.cost?.output === 0)

      const actualCost = isFreeModel ? 0 : estimatedCost

      const rl = parseRateLimitHeaders(input.headers)

      db.insert(TokenUsageTable)
        .values({
          id:         Identifier.ascending("token_usage"),
          time:       Date.now(),

          session_id: input.sessionID ?? null,
          agent_id:   input.agentID  ?? null,
          project_id: input.projectID ?? null,

          provider_id: input.providerID,
          model_id:    input.modelID,
          purpose:     input.purpose,

          input_tokens:       input.tokens.input,
          output_tokens:      input.tokens.output,
          cache_read_tokens:  input.tokens.cacheRead,
          cache_write_tokens: input.tokens.cacheWrite,
          reasoning_tokens:   input.tokens.reasoning,

          cost_usd:           actualCost,
          estimated_cost_usd: estimatedCost,
          is_free:            isFreeModel,

          rl_requests_limit:     rl.rl_requests_limit,
          rl_requests_used:      rl.rl_requests_used,
          rl_requests_remaining: rl.rl_requests_remaining,
          rl_requests_reset_at:  rl.rl_requests_reset_at,
          rl_tokens_limit:       rl.rl_tokens_limit,
          rl_tokens_used:        rl.rl_tokens_used,
          rl_tokens_remaining:   rl.rl_tokens_remaining,
          rl_tokens_reset_at:    rl.rl_tokens_reset_at,
        })
        .run()

      // Update the per-provider usage file when at least one rl_ field is present
      const hasRlData =
        rl.rl_requests_limit     != null ||
        rl.rl_requests_used      != null ||
        rl.rl_requests_remaining != null ||
        rl.rl_requests_reset_at  != null ||
        rl.rl_tokens_limit       != null ||
        rl.rl_tokens_used        != null ||
        rl.rl_tokens_remaining   != null ||
        rl.rl_tokens_reset_at    != null
      if (hasRlData) {
        import("./token-usage-file.ts")
          .then(({ ProviderUsageFile }) =>
            ProviderUsageFile.update(input.providerID, input.modelID, {
              requests_limit:     rl.rl_requests_limit,
              requests_used:      rl.rl_requests_used,
              requests_remaining: rl.rl_requests_remaining,
              requests_reset_at:  rl.rl_requests_reset_at,
              tokens_limit:       rl.rl_tokens_limit,
              tokens_used:        rl.rl_tokens_used,
              tokens_remaining:   rl.rl_tokens_remaining,
              tokens_reset_at:    rl.rl_tokens_reset_at,
            }),
          )
          .catch(() => {})
      }
    } catch (err) {
      // Never throw from this helper — token tracking must not break the main flow
      console.error("[token-usage] failed to record token usage:", err)
    }
  }
}
