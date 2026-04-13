/**
 * FallbackManager — cross-provider free model fallback groups.
 *
 * Maintains a global persistent state of which provider slot is active
 * for each fallback group, with cooldown after errors and hourly rotation
 * during active use only.
 */

import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"
import { getConfig } from "./config.ts"

export namespace FallbackManager {
  export type Slot = {
    providerID: string
    modelID: string
  }

  export type Group = {
    id: string
    displayName: string
    slots: Slot[] // priority order: first = preferred
  }

  type CooldownEntry = {
    until: number  // epoch ms
    reason: string
  }

  type RotationEntry = {
    slotIndex: number
    activeSince: number  // epoch ms — when this slot was activated
    lastUsed: number     // epoch ms — updated on every use
  }

  type State = {
    version: 1
    cooldowns: Record<string, CooldownEntry>  // key: "providerID:modelID"
    rotations: Record<string, RotationEntry>  // key: groupID
  }

  const COOLDOWN_MS    = 2 * 60 * 60 * 1000  // 2h after error
  const ROTATION_MS    = 1 * 60 * 60 * 1000  // rotate after 1h active use
  const IDLE_THRESHOLD = 5 * 60 * 1000        // >5min gap = idle, don't count toward rotation

  const BUILTIN_GROUPS: Group[] = [
    {
      id: "nemotron-3-super",
      displayName: "Nemotron Free",
      slots: [
        { providerID: "opencode",   modelID: "nemotron-3-super-free" },
        { providerID: "openrouter", modelID: "nvidia/nemotron-3-super-120b-a12b-free" },
        { providerID: "kilo",       modelID: "nvidia/nemotron-3-super-120b-a12b:free" },
      ],
    },
    {
      id: "trinity-large",
      displayName: "Trinity Large Free",
      slots: [
        { providerID: "opencode",   modelID: "trinity-large-preview-free" },
        { providerID: "openrouter", modelID: "arcee-ai/trinity-large-preview:free" },
        { providerID: "kilo",       modelID: "arcee-ai/trinity-large-preview:free" },
      ],
    },
    {
      id: "kimi-k2",
      displayName: "Kimi K2 Free",
      slots: [
        { providerID: "opencode",   modelID: "kimi-k2.5-free" },
        { providerID: "openrouter", modelID: "moonshotai/kimi-k2:free" },
      ],
    },
    {
      id: "grok-code",
      displayName: "Grok Code Free",
      slots: [
        { providerID: "opencode", modelID: "grok-code" },
        { providerID: "kilo",     modelID: "x-ai/grok-code-fast-1:optimized:free" },
      ],
    },
    {
      id: "step-3.5-flash",
      displayName: "Step 3.5 Flash Free",
      slots: [
        { providerID: "openrouter", modelID: "stepfun/step-3.5-flash:free" },
        { providerID: "kilo",       modelID: "stepfun/step-3.5-flash:free" },
      ],
    },
    {
      id: "minimax-m2.5",
      displayName: "MiniMax M2.5 Free",
      slots: [
        { providerID: "opencode", modelID: "minimax-m2.5-free" },
        { providerID: "kilo",     modelID: "minimax/minimax-m2.5:free" },
      ],
    },
  ]

  // --- State persistence ---

  function statePath(): string {
    const cfg = getConfig()
    const base = cfg.providersPath ?? cfg.dataPath
    return join(base, "fallback-state.json")
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

  // --- Group registry ---

  let _groups: Group[] | null = null

  export function allGroups(): Group[] {
    if (_groups) return _groups
    _groups = BUILTIN_GROUPS
    return _groups
  }

  export function getGroup(id: string): Group | undefined {
    return allGroups().find((g) => g.id === id)
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
    return null  // all cooled
  }

  /**
   * Resolve a fallback groupID to an actual { providerID, modelID } slot.
   * Updates lastUsed and handles time-based rotation.
   */
  export async function resolve(groupID: string): Promise<Slot> {
    const group = getGroup(groupID)
    if (!group) throw new Error(`Unknown fallback group: ${groupID}`)

    const state = await loadState()
    const now = Date.now()

    let rotation = state.rotations[groupID]
    if (!rotation) {
      rotation = { slotIndex: 0, activeSince: now, lastUsed: now }
    }

    // Only count time toward rotation if actively used (gap < IDLE_THRESHOLD)
    const isActive = now - rotation.lastUsed < IDLE_THRESHOLD
    if (isActive && now - rotation.activeSince > ROTATION_MS) {
      // Time to rotate — find next available slot
      const next = nextAvailableSlot(group, state, rotation.slotIndex)
      if (next !== null) {
        rotation = { slotIndex: next, activeSince: now, lastUsed: now }
      } else {
        rotation = { ...rotation, activeSince: now, lastUsed: now }
      }
    } else {
      rotation = { ...rotation, lastUsed: now }
    }

    // If current slot is on cooldown, advance
    if (isCooled(state, group.slots[rotation.slotIndex])) {
      const next = nextAvailableSlot(group, state, rotation.slotIndex)
      if (next !== null) {
        rotation = { slotIndex: next, activeSince: now, lastUsed: now }
      }
      // if all cooled, stay on current (will fail downstream, nothing we can do)
    }

    state.rotations[groupID] = rotation
    await saveState(state)

    return group.slots[rotation.slotIndex]
  }

  /**
   * Called when a slot returns a non-retryable error.
   * Puts the slot on cooldown and returns the next available slot, or null if all exhausted.
   */
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

    // Put errored slot on cooldown
    state.cooldowns[cooldownKey(slot)] = { until: now + COOLDOWN_MS, reason }

    // Find current slot index
    const currentIdx = group.slots.findIndex(
      (s) => s.providerID === slot.providerID && s.modelID === slot.modelID,
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

  /**
   * Returns the currently active slot for a group without updating state.
   * Used for display purposes only.
   */
  export async function getCurrentSlot(groupID: string): Promise<Slot | null> {
    const group = getGroup(groupID)
    if (!group) return null
    const state = await loadState()
    const rotation = state.rotations[groupID]
    const idx = rotation?.slotIndex ?? 0
    return group.slots[idx] ?? null
  }
}
