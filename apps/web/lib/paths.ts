/**
 * Path inheritance utilities.
 *
 * The access model is a strict top-down hierarchy:
 *
 *   Agent.paths
 *     ↓ implicit (session inherits agent paths on creation)
 *   Session.paths
 *     ↓ implicit (sub-session inherits parent session paths on creation)
 *   SubSession.paths
 *
 * At every level a child can only:
 *   - Narrow: replace a path with a sub-path
 *   - Downgrade: change edit:true → edit:false
 *   - Remove: drop a path entirely
 *
 * A child can never expand or promote (no new paths, no explore→edit).
 */

import type { PathEntry, Agent, Session } from "./projectflows"

// ── Normalise ────────────────────────────────────────────────────────────────

function norm(p: string) {
  return p.replace(/\/+$/, "") // strip trailing slash
}

// ── Agent paths ──────────────────────────────────────────────────────────────

/**
 * Return the canonical PathEntry[] for an agent.
 * Reads config.paths first, falls back to config.defaultPaths (treated as explore-only).
 */
export function agentPaths(agent: Agent & { config?: { paths?: PathEntry[]; defaultPaths?: string[] } }): PathEntry[] {
  // config is the nested object returned by the API
  const configPaths = (agent as any)?.config?.paths as PathEntry[] | undefined
  const configDefaults = (agent as any)?.config?.defaultPaths as string[] | undefined

  const topPaths = agent.paths
  const topDefaults = agent.defaultPaths

  const paths = configPaths ?? topPaths
  if (paths && paths.length > 0) return paths.map((e) => ({ ...e, path: norm(e.path) }))

  const defaults = configDefaults ?? topDefaults
  if (defaults && defaults.length > 0) {
    // Legacy defaultPaths — treat as explore-only
    return defaults.map((p) => ({ path: norm(p), edit: false }))
  }

  return []
}

// ── Session paths ─────────────────────────────────────────────────────────────

/**
 * Return the canonical PathEntry[] for a session.
 * Reads session.paths first, then falls back to legacy path/readPath fields.
 */
export function sessionOwnPaths(session: Session): PathEntry[] {
  if (session.paths && session.paths.length > 0) {
    return session.paths.map((e) => ({ ...e, path: norm(e.path) }))
  }
  const result: PathEntry[] = []
  if (session.path) result.push({ path: norm(session.path), edit: true })
  if (session.readPath) result.push({ path: norm(session.readPath), edit: false })
  return result
}

// ── Effective paths ───────────────────────────────────────────────────────────

/**
 * Compute the effective PathEntry[] for a session given its agent and optional parent session.
 *
 * Inheritance order (first match wins):
 *   1. If session has own paths → use them (validated against ceiling below)
 *   2. If parent session exists → inherit parent session paths
 *   3. Else inherit agent paths
 *
 * The "ceiling" is the parent session (if any) or the agent paths — whichever is more restrictive.
 */
export function effectiveSessionPaths(
  session: Session,
  agent: Agent & { config?: any } | undefined,
  parentSession?: Session,
): PathEntry[] {
  // Determine the ceiling (what this session is allowed to access)
  const ceiling: PathEntry[] = parentSession
    ? sessionOwnPaths(parentSession).length > 0
      ? sessionOwnPaths(parentSession)
      : agent ? agentPaths(agent) : []
    : agent
      ? agentPaths(agent)
      : []

  const own = sessionOwnPaths(session)

  // No own paths → implicit inheritance: use the ceiling verbatim
  if (own.length === 0) return ceiling

  // Own paths exist → validate each against the ceiling
  // Keep only entries that are sub-paths of (or equal to) a ceiling entry,
  // and cannot have more edit access than the ceiling grants.
  return own
    .map((entry) => {
      const p = norm(entry.path)
      const base = ceiling.find(
        (c) => p === norm(c.path) || p.startsWith(norm(c.path) + "/"),
      )
      if (!base) return null // outside ceiling → drop
      return {
        path: p,
        // Cannot promote: if base is explore-only, force explore
        edit: entry.edit && base.edit,
      }
    })
    .filter((e): e is PathEntry => e !== null)
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

/**
 * Merge and deduplicate a list of PathEntry arrays.
 * Earlier entries take precedence (first-seen wins per path).
 */
export function mergePaths(...sources: PathEntry[][]): PathEntry[] {
  const seen = new Set<string>()
  const result: PathEntry[] = []
  for (const source of sources) {
    for (const entry of source) {
      const key = norm(entry.path)
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ ...entry, path: key })
    }
  }
  return result
}
