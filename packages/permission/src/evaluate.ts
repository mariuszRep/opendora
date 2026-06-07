import os from "os"
import type { Permission } from "./types.js"
import { Wildcard } from "./pattern.js"

export function expand(pattern: string): string {
  if (pattern.startsWith("~/")) return os.homedir() + pattern.slice(1)
  if (pattern === "~") return os.homedir()
  if (pattern.startsWith("$HOME/")) return os.homedir() + pattern.slice(5)
  if (pattern.startsWith("$HOME")) return os.homedir() + pattern.slice(5)
  return pattern
}

export const wildcardMatch = Wildcard.match

/** Find the last matching static rule for a resource/access/pattern triple. */
export function evaluateStatic(
  resource: string,
  access: string,
  pattern: string,
  rules: Permission.StaticRule[],
): Permission.StaticRule | undefined {
  return rules.findLast(
    (r) =>
      wildcardMatch(resource, r.resource) &&
      wildcardMatch(access, r.access) &&
      wildcardMatch(pattern, r.pattern),
  )
}

/** Find the last matching persisted rule for a resource/access/pattern triple. */
export function evaluateDB(
  resource: string,
  access: string,
  pattern: string,
  rules: Permission.Rule[],
): Permission.Rule | undefined {
  return rules.findLast(
    (r) =>
      wildcardMatch(resource, r.resource) &&
      wildcardMatch(access, r.access) &&
      wildcardMatch(pattern, r.pattern),
  )
}

// ── Legacy helpers (for static agent-config rulesets) ────────────────────────

const LEGACY_EDIT_TOOLS = ["edit", "write", "patch", "multiedit"]

export function evaluateLegacy(
  permission: string,
  pattern: string,
  rules: Permission.LegacyRule[],
): Permission.LegacyRule {
  return (
    rules.findLast(
      (r) => wildcardMatch(permission, r.permission) && wildcardMatch(pattern, r.pattern),
    ) ?? { permission, pattern, action: "ask" }
  )
}

export function mergeLegacy(...rulesets: Permission.LegacyRuleset[]): Permission.LegacyRuleset {
  return rulesets.flat()
}

export function disabledLegacy(tools: string[], ruleset: Permission.LegacyRuleset): Set<string> {
  const result = new Set<string>()
  for (const tool of tools) {
    const permission = LEGACY_EDIT_TOOLS.includes(tool) ? "edit" : tool
    const rule = ruleset.findLast((r) => wildcardMatch(permission, r.permission))
    if (!rule) continue
    if (rule.pattern === "*" && rule.action === "deny") result.add(tool)
  }
  return result
}

export function fromLegacyConfig(
  permission: Record<string, string | Record<string, string>>,
): Permission.LegacyRuleset {
  const ruleset: Permission.LegacyRuleset = []
  for (const [key, value] of Object.entries(permission)) {
    if (typeof value === "string") {
      ruleset.push({ permission: key, action: value as Permission.Action, pattern: "*" })
      continue
    }
    ruleset.push(
      ...Object.entries(value).map(([pattern, action]) => ({
        permission: key,
        pattern: expand(pattern),
        action: action as Permission.Action,
      })),
    )
  }
  return ruleset
}

export function extractPathBoundaries(ruleset: Permission.LegacyRuleset): {
  writePaths: string[]
  readPath: string | undefined
} {
  const writePaths: string[] = []
  const readPaths: string[] = []
  for (const rule of ruleset) {
    if (rule.permission === "path.write") {
      if (rule.action === "allow") writePaths.push(rule.pattern)
      else writePaths.splice(writePaths.indexOf(rule.pattern), 1)
    }
    if (rule.permission === "path.read") {
      if (rule.action === "allow") readPaths.push(rule.pattern)
      else readPaths.splice(readPaths.indexOf(rule.pattern), 1)
    }
  }
  return { writePaths, readPath: readPaths[readPaths.length - 1] }
}
