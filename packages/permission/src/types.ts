import z from "zod"

export namespace Permission {
  // ── Enums ──────────────────────────────────────────────────────────────────

  export const Scope = z.enum(["session", "agent", "workflow"]).meta({ ref: "PermissionScope" })
  export type Scope = z.infer<typeof Scope>

  export const Access = z.enum(["read", "write", "execute", "*"]).meta({ ref: "PermissionAccess" })
  export type Access = z.infer<typeof Access>

  export const Action = z.enum(["allow", "deny", "ask"]).meta({ ref: "PermissionAction" })
  export type Action = z.infer<typeof Action>

  export const Reply = z.enum(["session", "agent", "reject", "workflow", "once"]).meta({ ref: "PermissionReply" })
  export type Reply = z.infer<typeof Reply>

  // ── Persisted rule (stored in DB) ─────────────────────────────────────────

  export const Rule = z
    .object({
      id: z.string(),
      scope: Scope,
      scope_id: z.string(),
      resource: z.string(),
      access: Access,
      pattern: z.string(),
      action: Action,
      time_created: z.number(),
      time_updated: z.number(),
    })
    .meta({ ref: "PermissionRule" })
  export type Rule = z.infer<typeof Rule>

  // ── Static rule (from agent config / defaults, not stored in DB) ───────────

  export const StaticRule = z.object({
    resource: z.string(),
    access: Access,
    pattern: z.string(),
    action: Action,
  })
  export type StaticRule = z.infer<typeof StaticRule>

  // ── Pending request (interactive approval prompt) ─────────────────────────

  export const Request = z
    .object({
      id: z.string(),
      session_id: z.string(),
      agent_id: z.string(),
      resource: z.string(),
      access: Access,
      patterns: z.string().array(),
      /** Broader patterns to persist at agent scope when reply is "agent". */
      agent_patterns: z.string().array(),
      /** Present when the request originates from a workflow node — the scope_id for a "workflow" reply. */
      workflow_id: z.string().optional(),
      metadata: z.record(z.string(), z.any()),
      tool: z
        .object({
          message_id: z.string(),
          call_id: z.string(),
        })
        .optional(),
    })
    .meta({ ref: "PermissionRequest" })
  export type Request = z.infer<typeof Request>

  // ── DB and Emitter interfaces (injected by consumer) ─────────────────────

  export interface DB {
    getRules(scope: Scope, scope_id: string): Rule[]
    saveRule(rule: Rule): void
    removeRule(id: string): void
  }

  export interface Emitter {
    emit(type: string, payload: unknown): void
  }

  // ── Legacy ruleset types (kept for static agent config rules) ─────────────

  export const LegacyRule = z
    .object({
      permission: z.string(),
      pattern: z.string(),
      action: Action,
    })
    .meta({ ref: "PermissionLegacyRule" })
  export type LegacyRule = z.infer<typeof LegacyRule>

  export const LegacyRuleset = LegacyRule.array().meta({ ref: "PermissionLegacyRuleset" })
  export type LegacyRuleset = z.infer<typeof LegacyRuleset>

  // ── Errors ────────────────────────────────────────────────────────────────

  export class RejectedError extends Error {
    constructor() {
      super("The user rejected permission to use this specific tool call.")
    }
  }

  export class CorrectedError extends Error {
    constructor(message: string) {
      super(
        `The user rejected permission to use this specific tool call with the following feedback: ${message}`,
      )
    }
  }

  export class DeniedError extends Error {
    constructor(public readonly rules: Rule[]) {
      super(
        `Permission denied by rule: ${JSON.stringify(rules)}`,
      )
    }
  }
}
