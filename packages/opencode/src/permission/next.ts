/**
 * Thin adapter wiring @opendora/permission into the opencode runtime.
 *
 * Responsibilities:
 *  - Provide the Permission.DB implementation using the project DB
 *  - Provide the Permission.Emitter implementation using GlobalBus
 *  - Map old-style "permission" strings to { resource, access } for the store
 *  - Re-export legacy helpers (fromConfig, merge, evaluate, disabled) used by agent.ts
 */
import {
  Permission,
  createStore,
  createRouter,
  fromLegacyConfig,
  mergeLegacy,
  evaluateLegacy,
  disabledLegacy,
  extractPathBoundaries as _extractPathBoundaries,
  type AskInput,
  type PermissionStore,
} from "@opendora/permission"
import { Database, eq, and } from "@/storage/db"
import { PermissionRuleTable } from "@/storage/permission.sql"
import { GlobalBus } from "@/bus/global"
import type { Hono } from "hono"

// ── DB adapter ────────────────────────────────────────────────────────────────

const permissionDB: Permission.DB = {
  getRules(scope, scope_id) {
    return Database.use((db) =>
      db
        .select()
        .from(PermissionRuleTable)
        .where(
          and(
            eq(PermissionRuleTable.scope, scope),
            eq(PermissionRuleTable.scope_id, scope_id),
          ),
        )
        .all(),
    )
  },
  saveRule(rule) {
    Database.use((db) =>
      db
        .insert(PermissionRuleTable)
        .values(rule)
        .onConflictDoUpdate({
          target: PermissionRuleTable.id,
          set: {
            action: rule.action,
            time_updated: rule.time_updated,
          },
        })
        .run(),
    )
  },
  removeRule(id) {
    Database.use((db) => db.delete(PermissionRuleTable).where(eq(PermissionRuleTable.id, id)).run())
  },
}

// ── Emitter adapter ───────────────────────────────────────────────────────────

const permissionEmitter: Permission.Emitter = {
  emit(type, payload) {
    GlobalBus.emit("event", { payload: { type, properties: payload } })
  },
}

// ── Singleton store + router ──────────────────────────────────────────────────

let _store: PermissionStore | undefined
let _router: Hono | undefined

function store(): PermissionStore {
  if (!_store) _store = createStore(permissionDB, permissionEmitter)
  return _store
}

function router(): Hono {
  if (!_router) _router = createRouter(store())
  return _router!
}

// ── Permission string → resource/access mapping ───────────────────────────────

const PERMISSION_MAP: Record<string, { resource: string; access: Permission.Access }> = {
  bash: { resource: "bash", access: "execute" },
  read: { resource: "file", access: "read" },
  edit: { resource: "file", access: "write" },
  write: { resource: "file", access: "write" },
  patch: { resource: "file", access: "write" },
  multiedit: { resource: "file", access: "write" },
  glob: { resource: "file", access: "read" },
  grep: { resource: "file", access: "read" },
  list: { resource: "directory", access: "read" },
  external_directory: { resource: "directory", access: "*" },
  webfetch: { resource: "network", access: "read" },
  websearch: { resource: "network", access: "read" },
  codesearch: { resource: "network", access: "read" },
  task: { resource: "tool", access: "execute" },
  question: { resource: "tool", access: "execute" },
  doom_loop: { resource: "tool", access: "execute" },
  skill: { resource: "tool", access: "execute" },
  "path.write": { resource: "directory", access: "write" },
  "path.read": { resource: "directory", access: "read" },
}

function mapPermission(permission: string): { resource: string; access: Permission.Access } {
  if (PERMISSION_MAP[permission]) return PERMISSION_MAP[permission]
  if (permission.startsWith("agent_")) return { resource: "agent", access: "execute" }
  return { resource: permission, access: "*" }
}

/** Convert an old-style LegacyRuleset to StaticRule[] for the new store. */
function toStaticRules(ruleset: Permission.LegacyRuleset): Permission.StaticRule[] {
  return ruleset.map((r) => ({
    ...mapPermission(r.permission),
    pattern: r.pattern,
    action: r.action,
  }))
}

// ── Public API ────────────────────────────────────────────────────────────────

export namespace PermissionNext {
  // Re-export legacy types and helpers (used by agent.ts and other config consumers)
  export import Action = Permission.Action
  export import LegacyRule = Permission.LegacyRule
  export import LegacyRuleset = Permission.LegacyRuleset
  export import Reply = Permission.Reply
  export import RejectedError = Permission.RejectedError
  export import CorrectedError = Permission.CorrectedError
  export import DeniedError = Permission.DeniedError
  export import Rule = Permission.Rule

  // Keep old aliases for agent.ts compatibility
  export type Ruleset = Permission.LegacyRuleset
  export const fromConfig = fromLegacyConfig
  export const merge = mergeLegacy
  export const evaluate = evaluateLegacy
  export const disabled = disabledLegacy
  export const extractPathBoundaries = _extractPathBoundaries

  /**
   * Called by configure-session-core via ctx.ask().
   * Accepts old-style tool ask input and translates it to the new store format.
   */
  export async function ask(input: {
    permission: string
    patterns?: string[]
    always?: string[]
    metadata?: Record<string, unknown>
    sessionID: string
    agentID?: string
    ruleset: Permission.LegacyRuleset
    tool?: { messageID: string; callID: string }
    id?: string
  }): Promise<void> {
    const { resource, access } = mapPermission(input.permission)
    const askInput: AskInput = {
      id: input.id,
      session_id: input.sessionID,
      agent_id: input.agentID ?? "unknown",
      resource,
      access,
      patterns: input.patterns ?? ["*"],
      agent_patterns: input.always ?? [],
      metadata: input.metadata ?? {},
      static_rules: toStaticRules(input.ruleset),
      tool: input.tool
        ? { message_id: input.tool.messageID, call_id: input.tool.callID }
        : undefined,
    }
    return store().ask(askInput)
  }

  export function reply(input: {
    requestID: string
    reply: Permission.Reply
    message?: string
  }): void {
    store().reply({ request_id: input.requestID, reply: input.reply, message: input.message })
  }

  export function list(): Permission.Request[] {
    return store().listPending()
  }

  export function listRules(scope: Permission.Scope, scope_id: string): Permission.Rule[] {
    return store().listRules(scope, scope_id)
  }

  export function addRule(
    rule: Omit<Permission.Rule, "id" | "time_created" | "time_updated">,
  ): Permission.Rule {
    return store().addRule(rule)
  }

  export function removeRule(id: string, scope: Permission.Scope, scope_id: string): void {
    store().removeRule(id, scope, scope_id)
  }

  export function getRouter(): Hono {
    return router()
  }

  /** Drop the singleton store and router. Intended for test isolation only. */
  export function _resetForTesting() {
    _store = undefined
    _router = undefined
  }
}
