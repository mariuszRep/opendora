/**
 * Per-session skill-tool registry.
 *
 * When an agent loads a skill that declares tools in skill.json, those tool IDs
 * are added here for the session. The prompt builder reads this to expand the
 * agent's effective allowlist beyond its static agent.json tools array.
 *
 * In-memory only — rebuilt from conversation history if the process restarts,
 * since the model would re-invoke skill_load to use the tools anyway.
 */

const store = new Map<string, Set<string>>()

export function addSkillTools(sessionID: string, tools: string[]): void {
  let set = store.get(sessionID)
  if (!set) {
    set = new Set()
    store.set(sessionID, set)
  }
  for (const t of tools) set.add(t)
}

export function getSkillTools(sessionID: string): Set<string> {
  return store.get(sessionID) ?? new Set()
}
