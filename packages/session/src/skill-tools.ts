/**
 * Per-session skill-tool registry.
 *
 * Loaded skills may unlock additional tools for a session. Session owns the
 * current attached execution context, so this registry tracks and persists the
 * effective tool allowlist additions on the session record.
 */

import { eq } from "drizzle-orm"
import { getConfig } from "./config"
import { SessionTable } from "./session.sql"

const cache = new Map<string, Set<string>>()
const hydrated = new Set<string>()

function isUnconfiguredSession(err: unknown): boolean {
  return err instanceof Error && err.message.includes("@projectflows/session not configured")
}

function readPersisted(sessionID: string): string[] {
  try {
    const row = getConfig()
      .db.select({ unlocked_tools: SessionTable.unlocked_tools })
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionID))
      .get()
    return row?.unlocked_tools ?? []
  } catch (err) {
    if (isUnconfiguredSession(err)) return []
    console.error("[session-skill-tools] failed to read unlocked_tools", { sessionID, err })
    return []
  }
}

function writePersisted(sessionID: string, tools: string[]): void {
  try {
    getConfig()
      .db.update(SessionTable)
      .set({ unlocked_tools: tools })
      .where(eq(SessionTable.id, sessionID))
      .run()
  } catch (err) {
    if (isUnconfiguredSession(err)) return
    console.error("[session-skill-tools] failed to persist unlocked_tools", { sessionID, err })
  }
}

function ensureLoaded(sessionID: string): Set<string> {
  let set = cache.get(sessionID)
  if (!set) {
    set = new Set<string>()
    cache.set(sessionID, set)
  }
  if (!hydrated.has(sessionID)) {
    for (const tool of readPersisted(sessionID)) set.add(tool)
    hydrated.add(sessionID)
  }
  return set
}

export function addSkillTools(sessionID: string, tools: string[]): void {
  const set = ensureLoaded(sessionID)
  let changed = false
  for (const tool of tools) {
    if (!set.has(tool)) {
      set.add(tool)
      changed = true
    }
  }
  if (changed) writePersisted(sessionID, Array.from(set))
}

export function getSkillTools(sessionID: string): Set<string> {
  return ensureLoaded(sessionID)
}
