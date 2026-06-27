/**
 * ProviderUsageFile — per-provider real-time rate-limit state written to disk.
 *
 * Files live at <providersPath>/usage/<providerID>.json and store the latest
 * rate-limit window data for each provider/model pair. They are read by the
 * UI to show quota progress bars without hitting the DB.
 *
 * All operations are best-effort — errors are caught and swallowed so that
 * the main LLM flow is never interrupted.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { getConfig } from "./config.ts"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelUsageState {
  updatedAt: number
  requests_limit?: number | null
  requests_used?: number | null
  requests_remaining?: number | null
  requests_reset_at?: number | null
  tokens_limit?: number | null
  tokens_used?: number | null
  tokens_remaining?: number | null
  tokens_reset_at?: number | null
}

export interface ProviderUsageState {
  version: 1
  providerID: string
  updatedAt: number
  models: Record<string, ModelUsageState>
}

// ─── Internals ────────────────────────────────────────────────────────────────

function usageDir(): string | null {
  const cfg = getConfig()
  const providersPath = cfg.providersPath
  if (!providersPath) return null
  return join(providersPath, "usage")
}

function usageFilePath(providerID: string): string | null {
  const dir = usageDir()
  if (!dir) return null
  return join(dir, `${providerID}.json`)
}

function readRaw(filePath: string): ProviderUsageState | null {
  try {
    const raw = readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as ProviderUsageState
  } catch {
    return null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export namespace ProviderUsageFile {
  /**
   * Merge new rate-limit data for a model into the provider's usage file.
   * Written after every TokenUsage.record() call when at least one rl_ field
   * is non-null.
   */
  export async function update(
    providerID: string,
    modelID: string,
    rl: {
      requests_limit?: number | null
      requests_used?: number | null
      requests_remaining?: number | null
      requests_reset_at?: number | null
      tokens_limit?: number | null
      tokens_used?: number | null
      tokens_remaining?: number | null
      tokens_reset_at?: number | null
    },
  ): Promise<void> {
    try {
      const filePath = usageFilePath(providerID)
      if (!filePath) return

      const dir = dirname(filePath)
      mkdirSync(dir, { recursive: true })

      const existing = readRaw(filePath) ?? {
        version: 1 as const,
        providerID,
        updatedAt: 0,
        models: {},
      }

      const now = Date.now()
      const prev: Partial<ModelUsageState> = existing.models[modelID] ?? {}

      existing.models[modelID] = {
        ...prev,
        updatedAt: now,
        requests_limit:     rl.requests_limit     ?? prev.requests_limit,
        requests_used:      rl.requests_used      ?? prev.requests_used,
        requests_remaining: rl.requests_remaining ?? prev.requests_remaining,
        requests_reset_at:  rl.requests_reset_at  ?? prev.requests_reset_at,
        tokens_limit:       rl.tokens_limit       ?? prev.tokens_limit,
        tokens_used:        rl.tokens_used        ?? prev.tokens_used,
        tokens_remaining:   rl.tokens_remaining   ?? prev.tokens_remaining,
        tokens_reset_at:    rl.tokens_reset_at    ?? prev.tokens_reset_at,
      }
      existing.updatedAt = now
      existing.providerID = providerID

      writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf-8")
    } catch {
      /* best-effort — never throw */
    }
  }

  /**
   * Read the usage state for a single provider.
   * Returns null if the file does not exist or cannot be parsed.
   */
  export function read(providerID: string): ProviderUsageState | null {
    try {
      const filePath = usageFilePath(providerID)
      if (!filePath) return null
      return readRaw(filePath)
    } catch {
      return null
    }
  }

  /**
   * Read usage state for all providers that have a usage file.
   * Returns an empty object if the usage directory does not exist.
   */
  export function readAll(): Record<string, ProviderUsageState> {
    try {
      const dir = usageDir()
      if (!dir) return {}

      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return {}
      }

      const result: Record<string, ProviderUsageState> = {}
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue
        const providerID = entry.slice(0, -5) // strip ".json"
        const state = readRaw(join(dir, entry))
        if (state) result[providerID] = state
      }
      return result
    } catch {
      return {}
    }
  }
}
