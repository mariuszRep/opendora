/**
 * Per-session skill-tool registry.
 *
 * When an agent loads a skill that declares tools in skill.json, those tool IDs
 * are added here for the session. The prompt builder reads this to expand the
 * agent's effective allowlist beyond its static agent.json tools array.
 *
 * Persisted to the `session.unlocked_tools` column so the allowlist survives
 * server restarts — reopening a session keeps the same skill-unlocked tools
 * without forcing the model to re-invoke skill_load. The in-memory cache keeps
 * `getSkillTools` synchronous (callers in the prompt/llm path are sync).
 */

import { Database, eq } from "@/storage/db"
import { SessionTable } from "@opendora/session/sql"

const cache = new Map<string, Set<string>>()
const hydrated = new Set<string>()

function readPersisted(sessionID: string): string[] {
  try {
    const row = Database.Client()
      .select({ unlocked_tools: SessionTable.unlocked_tools })
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionID))
      .get()
    return row?.unlocked_tools ?? []
  } catch (err) {
    console.error("[session-skill-tools] failed to read unlocked_tools", { sessionID, err })
    return []
  }
}

function writePersisted(sessionID: string, tools: string[]): void {
  try {
    Database.Client()
      .update(SessionTable)
      .set({ unlocked_tools: tools })
      .where(eq(SessionTable.id, sessionID))
      .run()
  } catch (err) {
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
    for (const t of readPersisted(sessionID)) set.add(t)
    hydrated.add(sessionID)
  }
  return set
}

export function addSkillTools(sessionID: string, tools: string[]): void {
  const set = ensureLoaded(sessionID)
  let changed = false
  for (const t of tools) {
    if (!set.has(t)) {
      set.add(t)
      changed = true
    }
  }
  if (changed) writePersisted(sessionID, Array.from(set))
}

export function getSkillTools(sessionID: string): Set<string> {
  return ensureLoaded(sessionID)
}
