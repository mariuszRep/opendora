/**
 * ProviderFallback - cross-provider model fallback groups.
 *
 * Manages rotation state (which slot is currently active in each group).
 * All cooldown tracking is delegated to ProviderTimeout — the single source
 * of truth for model health, shared between group routing and direct selection.
 */

import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"
import { Global } from "@opendora/util/global"
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

  /** Re-export for callers that only depend on @opendora/provider/fallback. */
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
      // Preserve only rotations — cooldowns are now in ProviderTimeout
      _state = { version: 1, rotations: parsed.rotations ?? {} }
    } catch {
      _state = { version: 1, rotations: {} }
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

  /** Find the next available (non-cooled) slot starting after fromIndex. */
  function nextAvailableSlot(
    group: Group,
    isSlotCooled: (slot: Slot) => boolean,
    fromIndex: number,
  ): number | null {
    const n = group.slots.length
    for (let i = 1; i <= n; i++) {
      const idx = (fromIndex + i) % n
      if (!isSlotCooled(group.slots[idx])) return idx
    }
    return null
  }

  export async function resolve(groupID: string): Promise<Slot> {
    const group = getGroup(groupID)
    if (!group) throw new Error(`Unknown fallback group: ${groupID}`)

    const cooldowns = await ProviderTimeout.getSlotCooldowns(group.slots)
    const isSlotCooled = (slot: Slot) => cooldowns.has(`${slot.providerID}:${slot.modelID}`)

    const state = await loadState()
    const now = Date.now()

    let rotation = state.rotations[groupID]
    if (!rotation) {
      rotation = { slotIndex: 0, activeSince: now, lastUsed: now }
    }

    const isActive = now - rotation.lastUsed < IDLE_THRESHOLD
    if (isActive && now - rotation.activeSince > ROTATION_MS) {
      const next = nextAvailableSlot(group, isSlotCooled, rotation.slotIndex)
      if (next !== null) {
        rotation = { slotIndex: next, activeSince: now, lastUsed: now }
      } else {
        rotation = { ...rotation, activeSince: now, lastUsed: now }
      }
    } else {
      rotation = { ...rotation, lastUsed: now }
    }

    if (isSlotCooled(group.slots[rotation.slotIndex])) {
      const next = nextAvailableSlot(group, isSlotCooled, rotation.slotIndex)
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

    // Delegate cooldown recording to ProviderTimeout (single source of truth)
    const timeoutResult = await ProviderTimeout.reportError(
      slot,
      statusCode,
      reason,
      responseHeaders,
      responseBody,
      kind,
    )

    // Reload cooldowns after reporting so the failed slot is included
    const cooldowns = await ProviderTimeout.getSlotCooldowns(group.slots)
    const isSlotCooled = (s: Slot) => cooldowns.has(`${s.providerID}:${s.modelID}`)

    const currentIdx = group.slots.findIndex(
      (item) => item.providerID === slot.providerID && item.modelID === slot.modelID,
    )
    const state = await loadState()
    const now = Date.now()
    const searchFrom = currentIdx >= 0 ? currentIdx : (state.rotations[groupID]?.slotIndex ?? 0)

    const nextIdx = nextAvailableSlot(group, isSlotCooled, searchFrom)
    if (nextIdx === null) {
      await saveState(state)
      return { nextSlot: null, providerTimedOut: timeoutResult.providerTimedOut, resetAt: timeoutResult.resetAt }
    }

    state.rotations[groupID] = { slotIndex: nextIdx, activeSince: now, lastUsed: now }
    await saveState(state)

    return { nextSlot: group.slots[nextIdx], providerTimedOut: timeoutResult.providerTimedOut, resetAt: timeoutResult.resetAt }
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

    const [cooldowns, state] = await Promise.all([
      ProviderTimeout.getSlotCooldowns(group.slots),
      loadState(),
    ])

    const rotation = state.rotations[groupID]
    const activeIdx = rotation?.slotIndex ?? 0

    const slots: SlotState[] = group.slots.map((slot, idx) => {
      const key = `${slot.providerID}:${slot.modelID}`
      const cd = cooldowns.get(key)
      const cooled = !!cd
      return {
        ...slot,
        active: idx === activeIdx && !cooled,
        cooled,
        cooldown: cd
          ? { until: cd.until, resetInSeconds: cd.resetInSeconds, reason: cd.reason, kind: cd.kind }
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

  /** Manually promote a specific slot to be the active one, clearing its cooldown. */
  export async function setActiveSlot(groupID: string, slot: Slot): Promise<boolean> {
    const group = getGroup(groupID)
    if (!group) return false
    const idx = group.slots.findIndex((s) => s.providerID === slot.providerID && s.modelID === slot.modelID)
    if (idx === -1) return false

    await ProviderTimeout.clearModelCooldown(slot)

    const state = await loadState()
    const now = Date.now()
    state.rotations[groupID] = { slotIndex: idx, activeSince: now, lastUsed: now }
    await saveState(state)
    return true
  }

  /** Clear all slot cooldowns for a group by clearing them from ProviderTimeout. */
  export async function clearGroupCooldowns(groupID: string): Promise<boolean> {
    const group = getGroup(groupID)
    if (!group) return false

    await Promise.all(group.slots.map((slot) => ProviderTimeout.clearModelCooldown(slot)))

    const state = await loadState()
    delete state.rotations[groupID]
    await saveState(state)
    return true
  }
}
