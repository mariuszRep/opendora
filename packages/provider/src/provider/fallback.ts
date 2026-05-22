/**
 * ProviderFallback - cross-provider model fallback groups.
 *
 * Maintains persistent state for the active provider slot in each fallback group,
 * with cooldown after errors and hourly rotation during active use.
 */

import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"
import { Global } from "@opendora/core/global"
import { ProviderError } from "./error"
import { ProviderTimeout } from "./timeout"

export namespace ProviderFallback {
  export type Slot = {
    providerID: string
    modelID: string
  }

  export type Group = {
    id: string
    displayName: string
    slots: Slot[]
  }

  type CooldownEntry = {
    until: number
    reason: string
    kind: ProviderError.ErrorKind
  }

  /** Re-export from ProviderError for callers that only depend on @opendora/provider/fallback. */
  export function isFallbackEligible(kind: ProviderError.ErrorKind): boolean {
    return ProviderError.isFallbackEligible(kind)
  }

  type RotationEntry = {
    slotIndex: number
    activeSince: number
    lastUsed: number
  }

  type State = {
    version: 1
    cooldowns: Record<string, CooldownEntry>
    rotations: Record<string, RotationEntry>
  }

  const ROTATION_MS = 1 * 60 * 60 * 1000
  const IDLE_THRESHOLD = 5 * 60 * 1000

  function statePath(): string {
    return join(Global.Path.providers, "fallback-state.json")
  }

  let _state: State | null = null

  async function loadState(): Promise<State> {
    if (_state) return _state
    try {
      const raw = await readFile(statePath(), "utf-8")
      const parsed = JSON.parse(raw) as State
      // Backfill `kind` for entries written before ErrorKind was introduced
      for (const entry of Object.values(parsed.cooldowns)) {
        if (!entry.kind) entry.kind = "quota"
      }
      _state = parsed
    } catch {
      _state = { version: 1, cooldowns: {}, rotations: {} }
    }
    return _state
  }

  async function saveState(s: State): Promise<void> {
    _state = s
    const path = statePath()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(s, null, 2), "utf-8")
  }

  let _customGroups: Group[] = []

  export function setCustomGroups(groups: Group[]): void {
    _customGroups = groups.map((group) => ({ ...group, slots: group.slots.map((slot) => ({ ...slot })) }))
  }

  export function allGroups(): Group[] {
    return _customGroups.map((group) => ({ ...group, slots: group.slots.map((slot) => ({ ...slot })) }))
  }

  export function getGroup(id: string): Group | undefined {
    return allGroups().find((group) => group.id === id)
  }

  function cooldownKey(slot: Slot): string {
    return `${slot.providerID}:${slot.modelID}`
  }

  function isCooled(state: State, slot: Slot): boolean {
    const entry = state.cooldowns[cooldownKey(slot)]
    return !!entry && Date.now() < entry.until
  }

  function nextAvailableSlot(group: Group, state: State, fromIndex: number): number | null {
    const n = group.slots.length
    for (let i = 1; i <= n; i++) {
      const idx = (fromIndex + i) % n
      if (!isCooled(state, group.slots[idx])) return idx
    }
    return null
  }

  export async function resolve(groupID: string): Promise<Slot> {
    const group = getGroup(groupID)
    if (!group) throw new Error(`Unknown fallback group: ${groupID}`)

    const state = await loadState()
    const now = Date.now()

    let rotation = state.rotations[groupID]
    if (!rotation) {
      rotation = { slotIndex: 0, activeSince: now, lastUsed: now }
    }

    const isActive = now - rotation.lastUsed < IDLE_THRESHOLD
    if (isActive && now - rotation.activeSince > ROTATION_MS) {
      const next = nextAvailableSlot(group, state, rotation.slotIndex)
      if (next !== null) {
        rotation = { slotIndex: next, activeSince: now, lastUsed: now }
      } else {
        rotation = { ...rotation, activeSince: now, lastUsed: now }
      }
    } else {
      rotation = { ...rotation, lastUsed: now }
    }

    if (isCooled(state, group.slots[rotation.slotIndex])) {
      const next = nextAvailableSlot(group, state, rotation.slotIndex)
      if (next !== null) {
        rotation = { slotIndex: next, activeSince: now, lastUsed: now }
      }
    }

    state.rotations[groupID] = rotation
    await saveState(state)

    return group.slots[rotation.slotIndex]
  }

  export async function reportError(
    groupID: string,
    slot: Slot,
    statusCode: number | undefined,
    reason: string,
    responseHeaders?: Record<string, string>,
    responseBody?: string,
    kind: ProviderError.ErrorKind = "quota",
  ): Promise<{ nextSlot: Slot | null; providerTimedOut: boolean; resetAt: number | null }> {
    const group = getGroup(groupID)
    if (!group) return { nextSlot: null, providerTimedOut: false, resetAt: null }

    const state = await loadState()
    const now = Date.now()

    // Use API-provided reset time when available; fall back to kind-based default
    const resetAt = ProviderTimeout.parseResetFromHeaders(responseHeaders, responseBody)
    const until = resetAt ?? now + ProviderError.COOLDOWN_BY_KIND[kind]
    state.cooldowns[cooldownKey(slot)] = { until, reason, kind }

    // Also report to ProviderTimeout for provider-level tracking
    const timeoutResult = await ProviderTimeout.reportError(
      slot,
      statusCode,
      reason,
      responseHeaders,
      responseBody,
      kind,
    )

    const currentIdx = group.slots.findIndex(
      (item) => item.providerID === slot.providerID && item.modelID === slot.modelID,
    )
    const searchFrom = currentIdx >= 0 ? currentIdx : (state.rotations[groupID]?.slotIndex ?? 0)

    const nextIdx = nextAvailableSlot(group, state, searchFrom)
    if (nextIdx === null) {
      await saveState(state)
      return { nextSlot: null, providerTimedOut: timeoutResult.providerTimedOut, resetAt: until }
    }

    state.rotations[groupID] = { slotIndex: nextIdx, activeSince: now, lastUsed: now }
    await saveState(state)

    return { nextSlot: group.slots[nextIdx], providerTimedOut: timeoutResult.providerTimedOut, resetAt: until }
  }

  export async function getCurrentSlot(groupID: string): Promise<Slot | null> {
    const group = getGroup(groupID)
    if (!group) return null
    const state = await loadState()
    const rotation = state.rotations[groupID]
    const idx = rotation?.slotIndex ?? 0
    return group.slots[idx] ?? null
  }

  export type SlotState = Slot & {
    /** True if this slot is the current active choice for the group. */
    active: boolean
    /** True if this slot is currently in a cooldown window. */
    cooled: boolean
    cooldown: {
      until: number
      resetInSeconds: number
      reason: string
      kind: ProviderError.ErrorKind
    } | null
  }

  export type GroupState = {
    groupID: string
    displayName: string
    /** The slot currently chosen for requests (null if all slots are cooled). */
    activeSlot: Slot | null
    slots: SlotState[]
  }

  export async function getGroupState(groupID: string): Promise<GroupState | null> {
    const group = getGroup(groupID)
    if (!group) return null

    const state = await loadState()
    const now = Date.now()
    const rotation = state.rotations[groupID]
    const activeIdx = rotation?.slotIndex ?? 0

    const slots: SlotState[] = group.slots.map((slot, idx) => {
      const entry = state.cooldowns[cooldownKey(slot)]
      const cooled = !!entry && now < entry.until
      return {
        ...slot,
        active: idx === activeIdx && !cooled,
        cooled,
        cooldown: cooled
          ? {
              until: entry.until,
              resetInSeconds: Math.ceil((entry.until - now) / 1000),
              reason: entry.reason,
              kind: entry.kind,
            }
          : null,
      }
    })

    const activeSlot = slots.find((s) => s.active) ? group.slots[activeIdx] : null

    return { groupID, displayName: group.displayName, activeSlot, slots }
  }

  export async function allGroupStates(): Promise<GroupState[]> {
    const groups = allGroups()
    const states = await Promise.all(groups.map((g) => getGroupState(g.id)))
    return states.filter(Boolean) as GroupState[]
  }

  /** Clear all slot cooldowns for a group (does not affect provider-level timeout). */
  export async function clearGroupCooldowns(groupID: string): Promise<boolean> {
    const group = getGroup(groupID)
    if (!group) return false

    const state = await loadState()
    for (const slot of group.slots) {
      delete state.cooldowns[cooldownKey(slot)]
    }
    // Reset rotation so the first slot is tried next
    delete state.rotations[groupID]
    await saveState(state)
    return true
  }
}
