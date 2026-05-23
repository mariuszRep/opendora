/**
 * ProviderTimeout — per-model and provider-level rate-limit timeout tracking.
 *
 * Single source of truth for all cooldown state. Groups and direct model
 * selection both read from here so a failed model is always skipped regardless
 * of how it was selected.
 */

import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"
import { Global } from "@opendora/core/global"
import { ProviderError } from "./error"

export namespace ProviderTimeout {
  export type Slot = { providerID: string; modelID: string }

  type ModelFailure = { modelID: string; until: number; reason: string; statusCode?: number; kind: ProviderError.ErrorKind }

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
          else if (!mf.kind) mf.kind = "quota"
        }
        // Remove empty provider entries so the file stays clean
        if (!entry.until && Object.keys(entry.modelFailures).length === 0) {
          delete parsed.providers[pid]
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
   * Report a model error. Records a per-model cooldown. If 2+ models from the
   * same provider fail, the entire provider is also put on timeout.
   */
  export async function reportError(
    slot: Slot,
    statusCode: number | undefined,
    reason: string,
    headers?: Record<string, string>,
    responseBody?: string,
    kind: ProviderError.ErrorKind = "quota",
  ): Promise<{ providerTimedOut: boolean; resetAt: number | null }> {
    const state = await loadState()
    const entry = ensureProvider(state, slot.providerID)
    const now = Date.now()

    const resetAt = parseResetFromHeaders(headers, responseBody)
    const until = resetAt ?? now + ProviderError.COOLDOWN_BY_KIND[kind]

    entry.modelFailures[slot.modelID] = { modelID: slot.modelID, until, reason, statusCode, kind }

    const activeFailures = Object.values(entry.modelFailures).filter((mf) => mf.until > now)
    const wasTimedOut = entry.until !== null && entry.until > now

    if (activeFailures.length >= PROVIDER_TIMEOUT_THRESHOLD && !wasTimedOut) {
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

  /** Check if a specific model is in cooldown (includes provider-wide timeout). */
  export async function isModelCooled(slot: Slot): Promise<boolean> {
    const state = await loadState()
    const entry = state.providers[slot.providerID]
    if (!entry) return false
    const now = Date.now()
    if (entry.until && now < entry.until) return true
    const mf = entry.modelFailures[slot.modelID]
    return !!mf && now < mf.until
  }

  export type SlotCooldown = {
    until: number
    resetInSeconds: number
    reason: string
    kind: ProviderError.ErrorKind
  }

  /**
   * Batch slot cooldown lookup — loads state once and checks all slots.
   * Key format: "providerID:modelID".
   */
  export async function getSlotCooldowns(slots: Slot[]): Promise<Map<string, SlotCooldown>> {
    const state = await loadState()
    const now = Date.now()
    const result = new Map<string, SlotCooldown>()
    for (const slot of slots) {
      const entry = state.providers[slot.providerID]
      if (!entry) continue
      const key = `${slot.providerID}:${slot.modelID}`
      if (entry.until && now < entry.until) {
        result.set(key, {
          until: entry.until,
          resetInSeconds: Math.ceil((entry.until - now) / 1000),
          reason: entry.reason ?? "Provider timed out",
          kind: "quota",
        })
      } else {
        const mf = entry.modelFailures[slot.modelID]
        if (mf && now < mf.until) {
          result.set(key, {
            until: mf.until,
            resetInSeconds: Math.ceil((mf.until - now) / 1000),
            reason: mf.reason,
            kind: mf.kind,
          })
        }
      }
    }
    return result
  }

  export type ProviderTimeoutInfo = {
    timedOut: boolean
    until: number | null
    reason: string | null
    resetInSeconds: number | null
    /** Model IDs with active cooldowns (for backward compat) */
    failedModels: string[]
    /** Full per-model cooldown details keyed by modelID */
    modelCooldowns: Record<string, { until: number; resetInSeconds: number; reason: string; kind: string }>
  }

  /** Get all provider timeout and per-model cooldown statuses. */
  export async function allTimeoutInfo(): Promise<Record<string, ProviderTimeoutInfo>> {
    const state = await loadState()
    const now = Date.now()
    const result: Record<string, ProviderTimeoutInfo> = {}
    for (const [pid, entry] of Object.entries(state.providers)) {
      const timedOut = entry.until !== null && now < entry.until
      const activeFailures = Object.values(entry.modelFailures).filter((mf) => now < mf.until)
      if (!timedOut && activeFailures.length === 0) continue

      const modelCooldowns: Record<string, { until: number; resetInSeconds: number; reason: string; kind: string }> = {}
      for (const mf of activeFailures) {
        modelCooldowns[mf.modelID] = {
          until: mf.until,
          resetInSeconds: Math.ceil((mf.until - now) / 1000),
          reason: mf.reason,
          kind: mf.kind,
        }
      }

      result[pid] = {
        timedOut,
        until: entry.until,
        reason: entry.reason,
        resetInSeconds: timedOut ? Math.ceil((entry.until! - now) / 1000) : null,
        failedModels: activeFailures.map((mf) => mf.modelID),
        modelCooldowns,
      }
    }
    return result
  }

  /** Get timeout info for a single provider. */
  export async function getTimeoutInfo(providerID: string): Promise<ProviderTimeoutInfo | null> {
    const all = await allTimeoutInfo()
    return all[providerID] ?? null
  }

  /** Clear all timeout/cooldown state for an entire provider. */
  export async function clearTimeout(providerID: string): Promise<void> {
    const state = await loadState()
    delete state.providers[providerID]
    await saveState(state)
  }

  /**
   * Clear cooldown for a specific model only. If the provider was in timeout
   * because of this model and now falls below the threshold, the provider
   * timeout is also cleared.
   */
  export async function clearModelCooldown(slot: Slot): Promise<void> {
    const state = await loadState()
    const entry = state.providers[slot.providerID]
    if (!entry) return
    delete entry.modelFailures[slot.modelID]
    const now = Date.now()
    const activeFailures = Object.values(entry.modelFailures).filter((mf) => now < mf.until)
    if (activeFailures.length < PROVIDER_TIMEOUT_THRESHOLD) {
      entry.until = null
      entry.reason = null
    }
    await saveState(state)
  }
}
