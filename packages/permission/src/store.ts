import { Permission } from "./types.js"
import { evaluateStatic, evaluateDB } from "./evaluate.js"

export interface AskInput {
  id?: string
  session_id: string
  agent_id: string
  resource: string
  access: Permission.Access
  patterns: string[]
  /** Broader patterns to persist at agent scope when the user replies "agent". */
  agent_patterns: string[]
  metadata?: Record<string, unknown>
  static_rules: Permission.StaticRule[]
  tool?: { message_id: string; call_id: string }
}

export interface ReplyInput {
  request_id: string
  reply: Permission.Reply
  message?: string
}

interface PendingEntry {
  info: Permission.Request
  resolve: () => void
  reject: (e: unknown) => void
}

export function createStore(db: Permission.DB, emitter: Permission.Emitter) {
  const pending = new Map<string, PendingEntry>()
  const sessionCache = new Map<string, Permission.Rule[]>()
  const agentCache = new Map<string, Permission.Rule[]>()

  function sessionRules(session_id: string): Permission.Rule[] {
    if (!sessionCache.has(session_id)) sessionCache.set(session_id, db.getRules("session", session_id))
    return sessionCache.get(session_id)!
  }

  function agentRules(agent_id: string): Permission.Rule[] {
    if (!agentCache.has(agent_id)) agentCache.set(agent_id, db.getRules("agent", agent_id))
    return agentCache.get(agent_id)!
  }

  function invalidate(scope: Permission.Scope, scope_id: string) {
    if (scope === "session") sessionCache.delete(scope_id)
    else agentCache.delete(scope_id)
  }

  async function ask(input: AskInput): Promise<void> {
    for (const pattern of input.patterns) {
      // 1. Check static rules (from agent config / defaults)
      const staticMatch = evaluateStatic(input.resource, input.access, pattern, input.static_rules)
      if (staticMatch) {
        if (staticMatch.action === "deny") throw new Permission.DeniedError([])
        if (staticMatch.action === "allow") continue
      }

      // 2. Check DB rules: agent scope first, session scope overrides
      const combined = [...agentRules(input.agent_id), ...sessionRules(input.session_id)]
      const dbMatch = evaluateDB(input.resource, input.access, pattern, combined)
      if (dbMatch) {
        if (dbMatch.action === "deny") throw new Permission.DeniedError([dbMatch])
        if (dbMatch.action === "allow") continue
      }

      // 3. Still "ask" — block on user approval
      const id = input.id ?? generateId()
      const info: Permission.Request = {
        id,
        session_id: input.session_id,
        agent_id: input.agent_id,
        resource: input.resource,
        access: input.access,
        patterns: input.patterns,
        agent_patterns: input.agent_patterns,
        metadata: input.metadata ?? {},
        tool: input.tool,
      }

      return new Promise<void>((resolve, reject) => {
        pending.set(id, { info, resolve, reject })
        emitter.emit("permission.asked", info)
      })
    }
  }

  function reply(input: ReplyInput): void {
    const entry = pending.get(input.request_id)
    if (!entry) return
    pending.delete(input.request_id)

    emitter.emit("permission.replied", {
      session_id: entry.info.session_id,
      request_id: entry.info.id,
      reply: input.reply,
    })

    if (input.reply === "reject") {
      entry.reject(input.message ? new Permission.CorrectedError(input.message) : new Permission.RejectedError())
      // Reject all other pending requests from the same session
      for (const [id, e] of pending) {
        if (e.info.session_id !== entry.info.session_id) continue
        pending.delete(id)
        emitter.emit("permission.replied", {
          session_id: e.info.session_id,
          request_id: e.info.id,
          reply: "reject",
        })
        e.reject(new Permission.RejectedError())
      }
      return
    }

    if (input.reply === "session") {
      // Persist the specific patterns at session scope
      const now = Date.now()
      for (const pattern of entry.info.patterns) {
        const rule: Permission.Rule = {
          id: generateId(),
          scope: "session",
          scope_id: entry.info.session_id,
          resource: entry.info.resource,
          access: entry.info.access,
          pattern,
          action: "allow",
          time_created: now,
          time_updated: now,
        }
        db.saveRule(rule)
        sessionCache.get(entry.info.session_id)?.push(rule)
      }
      invalidate("session", entry.info.session_id)
      entry.resolve()
      emitter.emit("permission.rules.updated", {
        scope: "session",
        scope_id: entry.info.session_id,
      })
      resolveAutoApproved(entry.info.session_id, entry.info.agent_id)
      return
    }

    if (input.reply === "agent") {
      // Persist the broader patterns at agent scope
      const now = Date.now()
      const patternsToSave = entry.info.agent_patterns.length > 0
        ? entry.info.agent_patterns
        : entry.info.patterns
      for (const pattern of patternsToSave) {
        const rule: Permission.Rule = {
          id: generateId(),
          scope: "agent",
          scope_id: entry.info.agent_id,
          resource: entry.info.resource,
          access: entry.info.access,
          pattern,
          action: "allow",
          time_created: now,
          time_updated: now,
        }
        db.saveRule(rule)
        agentCache.get(entry.info.agent_id)?.push(rule)
      }
      invalidate("agent", entry.info.agent_id)
      entry.resolve()
      emitter.emit("permission.rules.updated", {
        scope: "agent",
        scope_id: entry.info.agent_id,
      })
      resolveAutoApproved(entry.info.session_id, entry.info.agent_id)
    }
  }

  /** Auto-approve other pending requests for the same session that now match DB rules. */
  function resolveAutoApproved(session_id: string, agent_id: string) {
    for (const [id, e] of pending) {
      if (e.info.session_id !== session_id) continue
      const combined = [...agentRules(agent_id), ...sessionRules(session_id)]
      const allAllowed = e.info.patterns.every((pattern) => {
        const match = evaluateDB(e.info.resource, e.info.access, pattern, combined)
        return match?.action === "allow"
      })
      if (!allAllowed) continue
      pending.delete(id)
      emitter.emit("permission.replied", {
        session_id: e.info.session_id,
        request_id: e.info.id,
        reply: "session",
      })
      e.resolve()
    }
  }

  function listPending(): Permission.Request[] {
    return Array.from(pending.values()).map((e) => e.info)
  }

  function listRules(scope: Permission.Scope, scope_id: string): Permission.Rule[] {
    return db.getRules(scope, scope_id)
  }

  function addRule(rule: Omit<Permission.Rule, "id" | "time_created" | "time_updated">): Permission.Rule {
    const now = Date.now()
    const full: Permission.Rule = { id: generateId(), time_created: now, time_updated: now, ...rule }
    db.saveRule(full)
    invalidate(rule.scope, rule.scope_id)
    emitter.emit("permission.rules.updated", { scope: rule.scope, scope_id: rule.scope_id })
    return full
  }

  function removeRule(id: string, scope: Permission.Scope, scope_id: string): void {
    db.removeRule(id)
    invalidate(scope, scope_id)
    emitter.emit("permission.rules.updated", { scope, scope_id })
  }

  return { ask, reply, listPending, listRules, addRule, removeRule }
}

export type PermissionStore = ReturnType<typeof createStore>

let _counter = 0
function generateId(): string {
  return `perm_${Date.now()}_${(++_counter).toString(36)}`
}
