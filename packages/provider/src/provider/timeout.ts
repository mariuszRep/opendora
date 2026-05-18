/**
 * ProviderTimeout — provider-level rate-limit timeout tracking.
 *
 * Tracks per-model failures and escalates to provider-wide timeout when
 * 2+ models from the same provider hit rate limits. Uses actual reset
 * timestamps from API response headers instead of fixed cooldowns.
 */

import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"
import { Global } from "@opendora/core/global"

export namespace ProviderTimeout {
  export type Slot = { providerID: string; modelID: string }

  type ModelFailure = { modelID: string; until: number; reason: string; statusCode?: number }

  type ProviderEntry = {
    until: number | null
    reason: string | null
    modelFailures: Record<string, ModelFailure>
  }

  type State = { version: 1; providers: Record<string, ProviderEntry> }

  const PROVIDER_TIMEOUT_THRESHOLD = 2

  function statePath(): string {
    return join(Global.Path.providers, "provider-timeout.json")
  }

  let _state: State | null = null

  async function loadState(): Promise<State> {
    if (_state) return _state
    try {
      const raw = await readFile(statePath(), "utf-8")
      const parsed = JSON.parse(raw) as State
      const now = Date.now()
      for (const [pid, entry] of Object.entries(parsed.providers)) {
        if (entry.until && now >= entry.until) { entry.until = null; entry.reason = null }
        for (const [mid, mf] of Object.entries(entry.modelFailures)) {
          if (now >= mf.until) delete entry.modelFailures[mid]
        }
      }
      _state = parsed
    } catch {
      _state = { version: 1, providers: {} }
    }
    return _state
  }

  async function saveState(s: State): Promise<void> {
    _state = s
    const path = statePath()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(s, null, 2), "utf-8")
  }

  function ensureProvider(state: State, providerID: string): ProviderEntry {
    if (!state.providers[providerID]) {
      state.providers[providerID] = { until: null, reason: null, modelFailures: {} }
    }
    return state.providers[providerID]
  }

  /** Parse reset timestamp from response headers (Codex + standard retry-after). */
  export function parseResetFromHeaders(
    headers: Record<string, string> | undefined,
    responseBody: string | undefined,
  ): number | null {
    if (!headers) return null

    const codexResetAt = headers["x-codex-primary-reset-at"]
    if (codexResetAt) {
      const ts = Number.parseFloat(codexResetAt) * 1000
      if (!Number.isNaN(ts) && ts > Date.now()) return ts
    }

    const codexResetAfter = headers["x-codex-primary-reset-after-seconds"]
    if (codexResetAfter) {
      const seconds = Number.parseFloat(codexResetAfter)
      if (!Number.isNaN(seconds) && seconds > 0) return Date.now() + seconds * 1000
    }

    const retryAfter = headers["retry-after"]
    if (retryAfter) {
      const seconds = Number.parseFloat(retryAfter)
      if (!Number.isNaN(seconds)) return Date.now() + seconds * 1000
      const parsed = Date.parse(retryAfter)
      if (!Number.isNaN(parsed)) return parsed
    }

    if (responseBody) {
      try {
        const body = JSON.parse(responseBody)
        const resetsAt = body?.error?.resets_at
        if (typeof resetsAt === "number") {
          const ts = resetsAt * 1000
          if (ts > Date.now()) return ts
        }
      } catch {}
    }

    return null
  }

  /**
   * Report a model error. If 2+ models from the same provider fail,
   * the entire provider is put on timeout until the latest reset time.
   * Returns true if the provider just entered timeout (for event publishing).
   */
  export async function reportError(
    slot: Slot,
    statusCode: number | undefined,
    reason: string,
    headers?: Record<string, string>,
    responseBody?: string,
  ): Promise<{ providerTimedOut: boolean; resetAt: number | null }> {
    const state = await loadState()
    const entry = ensureProvider(state, slot.providerID)
    const now = Date.now()

    const resetAt = parseResetFromHeaders(headers, responseBody)
    const until = resetAt ?? now + 2 * 60 * 60 * 1000 // fallback: 2h cooldown

    entry.modelFailures[slot.modelID] = {
      modelID: slot.modelID,
      until,
      reason,
      statusCode,
    }

    const activeFailures = Object.values(entry.modelFailures).filter((mf) => mf.until > now)
    const wasTimedOut = entry.until !== null && entry.until > now

    if (activeFailures.length >= PROVIDER_TIMEOUT_THRESHOLD && !wasTimedOut) {
      // Find the latest reset time among all failures
      const latestReset = Math.max(...activeFailures.map((mf) => mf.until))
      entry.until = latestReset
      entry.reason = `Provider timeout: ${activeFailures.length} models rate-limited (${activeFailures.map((mf) => mf.modelID).join(", ")})`
      await saveState(state)
      return { providerTimedOut: true, resetAt: latestReset }
    }

    await saveState(state)
    return { providerTimedOut: false, resetAt: until }
  }

  /** Check if a provider is currently in timeout. */
  export async function isTimedOut(providerID: string): Promise<boolean> {
    const state = await loadState()
    const entry = state.providers[providerID]
    if (!entry?.until) return false
    return Date.now() < entry.until
  }

  /** Check if a specific model is in cooldown. */
  export async function isModelCooled(slot: Slot): Promise<boolean> {
    const state = await loadState()
    const entry = state.providers[slot.providerID]
    if (!entry) return false
    // Provider-wide timeout covers all models
    if (entry.until && Date.now() < entry.until) return true
    const mf = entry.modelFailures[slot.modelID]
    return !!mf && Date.now() < mf.until
  }

  /** Get timeout info for a provider (for UI display). */
  export async function getTimeoutInfo(providerID: string): Promise<{
    timedOut: boolean
    until: number | null
    reason: string | null
    resetInSeconds: number | null
    failedModels: string[]
  } | null> {
    const state = await loadState()
    const entry = state.providers[providerID]
    if (!entry) return null

    const now = Date.now()
    const timedOut = entry.until !== null && now < entry.until
    const resetInSeconds = timedOut ? Math.ceil((entry.until! - now) / 1000) : null

    const failedModels = Object.values(entry.modelFailures)
      .filter((mf) => now < mf.until)
      .map((mf) => mf.modelID)

    return { timedOut, until: entry.until, reason: entry.reason, resetInSeconds, failedModels }
  }

  /** Get all provider timeout statuses (for UI listing). */
  export async function allTimeoutInfo(): Promise<
    Record<string, { timedOut: boolean; until: number | null; reason: string | null; resetInSeconds: number | null; failedModels: string[] }>
  > {
    const state = await loadState()
    const now = Date.now()
    const result: Record<string, any> = {}
    for (const [pid, entry] of Object.entries(state.providers)) {
      const timedOut = entry.until !== null && now < entry.until
      if (!timedOut && Object.keys(entry.modelFailures).length === 0) continue
      result[pid] = {
        timedOut,
        until: entry.until,
        reason: entry.reason,
        resetInSeconds: timedOut ? Math.ceil((entry.until! - now) / 1000) : null,
        failedModels: Object.values(entry.modelFailures)
          .filter((mf) => now < mf.until)
          .map((mf) => mf.modelID),
      }
    }
    return result
  }

  /** Clear timeout for a provider (e.g., after manual intervention). */
  export async function clearTimeout(providerID: string): Promise<void> {
    const state = await loadState()
    delete state.providers[providerID]
    await saveState(state)
  }
}
