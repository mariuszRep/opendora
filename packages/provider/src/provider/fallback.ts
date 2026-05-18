/**
 * ProviderFallback - cross-provider model fallback groups.
 *
 * Maintains persistent state for the active provider slot in each fallback group,
 * with cooldown after errors and hourly rotation during active use.
 */

import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"
import { Global } from "@opendora/core/global"

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

  const COOLDOWN_MS = 2 * 60 * 60 * 1000
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
      _state = JSON.parse(raw) as State
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
  ): Promise<Slot | null> {
    const group = getGroup(groupID)
    if (!group) return null

    const state = await loadState()
    const now = Date.now()

    state.cooldowns[cooldownKey(slot)] = { until: now + COOLDOWN_MS, reason }

    const currentIdx = group.slots.findIndex(
      (item) => item.providerID === slot.providerID && item.modelID === slot.modelID,
    )
    const searchFrom = currentIdx >= 0 ? currentIdx : (state.rotations[groupID]?.slotIndex ?? 0)

    const nextIdx = nextAvailableSlot(group, state, searchFrom)
    if (nextIdx === null) {
      await saveState(state)
      return null
    }

    state.rotations[groupID] = { slotIndex: nextIdx, activeSince: now, lastUsed: now }
    await saveState(state)

    return group.slots[nextIdx]
  }

  export async function getCurrentSlot(groupID: string): Promise<Slot | null> {
    const group = getGroup(groupID)
    if (!group) return null
    const state = await loadState()
    const rotation = state.rotations[groupID]
    const idx = rotation?.slotIndex ?? 0
    return group.slots[idx] ?? null
  }
}
