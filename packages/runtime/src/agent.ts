/**
 * Agent management for OpenCode
 * Now powered by @projectflows/agent with template-based agents
 */
import z from "zod"
import { Agent as AgentCore, AgentStorage } from "@projectflows/agent"
import { Instance } from "@projectflows/runtime/instance"
import { PermissionNext } from "@projectflows/permission/next"
import { Provider } from "@projectflows/provider/provider"
import { generateObject } from "ai"
import { Config } from "@projectflows/config/config"
import path from "path"
import { pipe, sortBy } from "remeda"
import { Flag } from "@projectflows/util/flag"
import { Global } from "@projectflows/util/global"
import { Skill } from "@projectflows/skills/skill"

import PROMPT_GENERATE from "./generate.txt"

export namespace Agent {
  // "native" hides the Delete action for these agents in the UI and marks them as
  // built-in in the CLI/TUI. Identity-only — no persona/config content lives here
  // (that's sourced entirely from plugin install, agents-default/agent-core in the
  // registry). Deriving this from actual plugin provenance instead (CapabilityRegistry)
  // isn't possible: packages/plugin depends on packages/tools depends on
  // packages/runtime, so packages/runtime can't depend back on packages/plugin
  // without a cycle. This ID list is the pragmatic alternative.
  const DEFAULT_AGENT_IDS = new Set([
    "build",
    "plan",
    "general",
    "explore",
    "product-owner",
    "agent-owner",
    "compaction",
    "title",
    "summary",
    "pm",
  ])

  const PRIMARY_AGENT_MODES = new Set(["primary", "all"] as const)
  const WORKER_AGENT_MODES = new Set(["worker", "subagent", "all"] as const)

  // Matches Truncate.GLOB from @projectflows/tools (tool-output dir glob)
  const TRUNCATE_GLOB = path.join(Global.Path.data, "tool-output", "*")

  export function isPrimaryMode(mode: string): boolean {
    return PRIMARY_AGENT_MODES.has(mode as "primary" | "all")
  }

  export function isWorkerMode(mode: string): boolean {
    return WORKER_AGENT_MODES.has(mode as "worker" | "subagent" | "all")
  }

  export const Info = z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      mode: z.enum(["subagent", "primary", "all", "worker", "system"]),
      native: z.boolean().optional(),
      hidden: z.boolean().optional(),
      topP: z.number().optional(),
      temperature: z.number().optional(),
      color: z.string().optional(),
      permission: PermissionNext.LegacyRuleset,
      model: z
        .object({
          modelID: z.string(),
          providerID: z.string(),
        })
        .optional(),
      variant: z.string().optional(),
      prompt: z.string().optional(),
      options: z.record(z.string(), z.any()),
      steps: z.number().int().positive().optional(),
      tools: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional(),
      workflows: z.array(z.string()).optional(),
      enableInjection: z.boolean().optional(),
      injectInstructions: z.boolean().optional(),
      config: AgentStorage.Config.optional(),
    })
    .meta({
      ref: "Agent",
    })
  export type Info = z.infer<typeof Info>

  /**
   * Build base default permissions (no user config — callers apply that separately).
   */
  async function buildBaseDefaults(): Promise<PermissionNext.LegacyRuleset> {
    const skillDirs = await Skill.dirs()
    const whitelistedDirs = [TRUNCATE_GLOB, ...skillDirs.map((dir) => path.join(dir, "*"))]

    return PermissionNext.fromConfig({
      "*": "ask",
      doom_loop: "ask",
      external_directory: {
        "*": "ask",
        ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
      },
      question: "deny",
      read: {
        "*": "ask",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
      agent_create: "ask",
      agent_update: "ask",
      agent_delete: "ask",
      agent_list: "ask",
      agent_get: "ask",
    })
  }

  /**
   * Re-apply the TRUNCATE_GLOB + skill-dir whitelist after all user/agent config
   * to protect those dirs from simple wildcard denials.
   * Only skips dirs that are EXPLICITLY denied (not just caught by "*": "deny").
   */
  async function reapplyWhitelist(
    permission: PermissionNext.LegacyRuleset,
    globalPermCfg: Record<string, unknown> | undefined,
    agentPermCfg: Record<string, unknown> | undefined,
  ): Promise<PermissionNext.LegacyRuleset> {
    const skillDirs = await Skill.dirs()
    const whitelistedDirs = [TRUNCATE_GLOB, ...skillDirs.map((dir) => path.join(dir, "*"))]
    const globalExtDir = globalPermCfg?.external_directory
    const agentExtDir = agentPermCfg?.external_directory
    const protectedDirs = whitelistedDirs.filter((dir) => {
      const explicitlyDenied =
        (typeof globalExtDir === "object" && globalExtDir !== null && (globalExtDir as Record<string, string>)[dir] === "deny") ||
        (typeof agentExtDir === "object" && agentExtDir !== null && (agentExtDir as Record<string, string>)[dir] === "deny")
      return !explicitlyDenied
    })
    if (protectedDirs.length === 0) return permission
    return PermissionNext.merge(
      permission,
      PermissionNext.fromConfig({
        external_directory: Object.fromEntries(protectedDirs.map((dir) => [dir, "allow"])),
      }),
    )
  }

  /**
   * Derive the agent's enabled skills from agent-scoped `skill` permission rules.
   *
   * Permission rules are the single source of truth for skill access. The
   * agent.json `skills[]` array is treated as a legacy cache: on first load,
   * if an agent has assigned skills but no skill rules yet, we seed one allow
   * rule per skill (migration). Thereafter the enabled set is computed purely
   * from rules so the UI toggle, system prompt, and skill_load all agree.
   *
   * Defensive: if the permission store / DB is unavailable, fall back to the
   * stored config.skills so agent listing never breaks.
   */
  async function deriveEnabledSkills(entry: AgentStorage.Entry): Promise<string[]> {
    try {
      let skillRules = PermissionNext.listRules("agent", entry.id).filter((r) => r.resource === "skill")

      // Migration: seed allow rules from legacy config.skills when none exist yet.
      if (skillRules.length === 0 && entry.config.skills?.length) {
        for (const name of entry.config.skills) {
          PermissionNext.addRule({
            scope: "agent",
            scope_id: entry.id,
            resource: "skill",
            access: "execute",
            pattern: name,
            action: "allow",
          })
        }
        skillRules = PermissionNext.listRules("agent", entry.id).filter((r) => r.resource === "skill")
      }

      const allNames: string[] = (await Skill.all()).map((s: any) => s.name)
      return allNames.filter(
        (name) => PermissionNext.evaluateStored("skill", "execute", name, skillRules)?.action === "allow",
      )
    } catch {
      return entry.config.skills ?? []
    }
  }

  function parseModelStr(m: string | undefined): { providerID: string; modelID: string } | undefined {
    if (!m) return undefined
    const idx = m.indexOf("/")
    if (idx < 0) return undefined
    return { providerID: m.slice(0, idx), modelID: m.slice(idx + 1) }
  }

  async function configToInfo(agentId: string, agentCfg: any): Promise<Info> {
    const cfg = await Config.get()
    let permission = await buildBaseDefaults()
    // User global config after base defaults
    permission = PermissionNext.merge(permission, PermissionNext.fromConfig(cfg.permission ?? {}))
    // Agent-specific config overlay
    if (agentCfg.permission) {
      permission = PermissionNext.merge(permission, PermissionNext.fromConfig(agentCfg.permission as any))
    }
    // Protect TRUNCATE_GLOB from simple wildcard denials
    permission = await reapplyWhitelist(permission, cfg.permission as Record<string, unknown> | undefined, agentCfg.permission as Record<string, unknown> | undefined)
    return {
      id: agentId,
      name: agentCfg.name ?? agentId,
      description: agentCfg.description,
      mode: agentCfg.mode ?? "all",
      native: false,
      hidden: agentCfg.hidden,
      temperature: agentCfg.temperature,
      topP: agentCfg.top_p,
      steps: agentCfg.steps,
      color: agentCfg.color,
      tools: undefined,
      skills: undefined,
      workflows: undefined,
      prompt: agentCfg.prompt || undefined,
      model: parseModelStr(agentCfg.model),
      variant: agentCfg.variant,
      permission,
      options: (agentCfg.options ?? {}) as Record<string, any>,
      enableInjection: undefined,
      injectInstructions: undefined,
      config: undefined,
    }
  }

  /**
   * Convert storage entry to Info with permissions, applying any config overrides
   */
  async function entryToInfo(entry: AgentStorage.Entry): Promise<Info> {
    const cfg = await Config.get()
    const agentCfg = (cfg.agent as any)?.[entry.id] as any
    const enabledSkills = await deriveEnabledSkills(entry)
    // Keep config.skills consistent with the rule-derived set so downstream
    // readers (system prompt, skill_list, skill_load) reflect permission rules.
    // Persist the change to storage so it survives across agent reloads.
    const sortedStored = [...(entry.config.skills ?? [])].sort()
    const sortedDerived = [...enabledSkills].sort()
    if (JSON.stringify(sortedStored) !== JSON.stringify(sortedDerived)) {
      entry.config.skills = enabledSkills
      try {
        await AgentStorage.update(agentBaseDir(), entry.id, { skills: enabledSkills })
      } catch (err) {
        console.error(`[Agent] Failed to update skills in storage for ${entry.id}:`, err)
      }
    }

    // Start with base defaults (no user config yet)
    let permission = await buildBaseDefaults()

    // Auto-inject path.write / path.read rules from defaultPaths so that path
    // boundaries are first-class permission rules rather than side-channel fields.
    const projectPath = entry.config.defaultPaths?.[0]
    if (projectPath) {
      permission = PermissionNext.merge(permission, [
        { permission: "path.write", pattern: projectPath, action: "allow" },
        { permission: "path.read", pattern: projectPath, action: "allow" },
      ])
    }

    // Convert tools array to allow/deny rules (template level, before user config).
    // Only affects named tool actions; meta-permissions (external_directory, doom_loop,
    // agent_*, path.*) are excluded so defaults for those remain intact.
    if (entry.config.tools !== undefined) {
      const TOOL_PERMISSIONS = new Set([
        "bash", "read", "glob", "grep", "edit", "write", "apply_patch",
        "task", "webfetch", "websearch", "codesearch",
        "todoread", "todowrite", "question", "skill",
      ])
      const allowedTools = new Set(entry.config.tools)
      // Only emit allow rules for listed tools. Unlisted tools get no static rule,
      // so they fall through to DB check then user prompt — never silently denied.
      const toolRules: PermissionNext.LegacyRuleset = []
      for (const tool of TOOL_PERMISSIONS) {
        if (allowedTools.has(tool)) toolRules.push({ permission: tool, pattern: "*", action: "allow" })
      }
      permission = PermissionNext.merge(permission, toolRules)
    }

    // Apply template-level permission rules (path-specific overrides etc.), before user config.
    if (entry.config.permission) {
      permission = PermissionNext.merge(permission, PermissionNext.fromConfig(entry.config.permission as any))
    }

    // Apply user's global permission config (after template rules so it can override them).
    permission = PermissionNext.merge(permission, PermissionNext.fromConfig(cfg.permission ?? {}))

    // Apply per-agent config permission overlay (highest priority user-controlled config).
    if (agentCfg?.permission) {
      permission = PermissionNext.merge(permission, PermissionNext.fromConfig(agentCfg.permission as any))
    }

    // Protect TRUNCATE_GLOB and skill dirs from simple wildcard external_directory denials,
    // while still honoring explicit per-path denials.
    permission = await reapplyWhitelist(permission, cfg.permission as Record<string, unknown> | undefined, agentCfg?.permission as Record<string, unknown> | undefined)

    // Re-allow file reads within the configured directory after ALL other rules (including user
    // config and reapplyWhitelist). This mirrors how reapplyWhitelist protects skill dirs:
    // adding a directory to an agent via defaultPaths always grants glob/read/grep access there,
    // regardless of tool restrictions or global deny rules.
    if (projectPath) {
      const dirGlob = path.join(projectPath, "*").replaceAll("\\", "/")
      const dirDeep = path.join(projectPath, "**").replaceAll("\\", "/")
      permission = PermissionNext.merge(permission, [
        { permission: "glob", pattern: dirGlob, action: "allow" },
        { permission: "grep", pattern: dirGlob, action: "allow" },
        { permission: "read", pattern: dirDeep, action: "allow" },
      ])
    }

    const modelOverride = typeof agentCfg?.model === "string" ? parseModelStr(agentCfg.model) : undefined
    const mode = agentCfg?.mode ?? entry.config.mode ?? "all"

    return {
      id: entry.id,
      name: (agentCfg as any)?.name ?? entry.config.name,
      description: agentCfg?.description ?? entry.config.description,
      mode,
      native: DEFAULT_AGENT_IDS.has(entry.id),
      hidden: agentCfg?.hidden ?? entry.config.hidden,
      temperature: agentCfg?.temperature ?? entry.config.temperature,
      topP: agentCfg?.top_p,
      steps: agentCfg?.steps ?? entry.config.steps,
      color: agentCfg?.color ?? entry.config.color,
      tools: entry.config.tools,
      skills: entry.config.skills,
      workflows: entry.config.workflows,
      prompt: agentCfg?.prompt ?? (entry.persona || undefined),
      model: modelOverride ?? entry.config.model,
      variant: agentCfg?.variant,
      permission,
      options: (agentCfg?.options ?? {}) as Record<string, any>,
      enableInjection: entry.config.enableInjection,
      injectInstructions: entry.config.injectInstructions,
      config: entry.config,
    }
  }

  function agentBaseDir() {
    return Flag.PROJECTFLOWS_CONFIG_DIR ? path.dirname(Flag.PROJECTFLOWS_CONFIG_DIR) : Global.Path.home
  }

  let _getPluginAgentDirs: (() => Promise<string[]>) | undefined

  export function configurePluginAgentDirs(fn: () => Promise<string[]>): void {
    _getPluginAgentDirs = fn
  }

  // Agent definitions are file-based (one agent.json + PERSONA.md read per agent).
  // get/getByIdOrName/list/defaultAgent were each independently re-reading every
  // agent off disk — every chat message resolves the agent at least twice, so
  // this was paying that I/O multiple times per message. Cache the raw entries
  // per baseDir and invalidate on any write (create/update/remove/setPersona/
  // setInjection are the only writers, all in this file).
  const entriesCache = new Map<string, Promise<AgentCore.Entry[]>>()

  function getEntries(): Promise<AgentCore.Entry[]> {
    const baseDir = agentBaseDir()
    let cached = entriesCache.get(baseDir)
    if (!cached) {
      cached = (async () => {
        const primary = await AgentCore.list(baseDir)
        if (!_getPluginAgentDirs) return primary
        const pluginDirs = await _getPluginAgentDirs()
        const pluginResults = await Promise.all(
          pluginDirs.map((d) => AgentStorage.loadFromRoot(path.join(d, "agents")).catch(() => [] as AgentCore.Entry[])),
        )
        return [...primary, ...pluginResults.flat()]
      })()
      entriesCache.set(baseDir, cached)
    }
    return cached
  }

  function invalidateEntries() {
    entriesCache.clear()
  }

  /**
   * Get a single agent by ID
   */
  export async function get(agent: string): Promise<Info | undefined> {
    const cfg = await Config.get()
    const agentCfg = (cfg.agent as any)?.[agent]
    if (agentCfg?.disable) return undefined
    const entries = await getEntries()
    const entry = entries.find((e) => e.id === agent)
    if (entry) return entryToInfo(entry)
    if (agentCfg) return configToInfo(agent, agentCfg)
    return undefined
  }

  /**
   * Get agent by ID or name (for backward compatibility with legacy data)
   * Tries ID first, then falls back to searching by name
   */
  export async function getByIdOrName(agentIdOrName: string): Promise<Info | undefined> {
    const cfg = await Config.get()
    const entries = await getEntries()
    const entry = entries.find((e) => e.id === agentIdOrName) ?? entries.find((e) => e.config.name === agentIdOrName)
    if (entry) {
      if ((cfg.agent as any)?.[entry.id]?.disable) return undefined
      return entryToInfo(entry)
    }
    const agentCfg = (cfg.agent as any)?.[agentIdOrName]
    if (agentCfg && !agentCfg.disable) return configToInfo(agentIdOrName, agentCfg)
    return undefined
  }

  /**
   * List all agents, applying config overlays and filtering disabled agents
   */
  export async function list(): Promise<Info[]> {
    const cfg = await Config.get()
    const entries = await getEntries()
    const entryIds = new Set(entries.map((e) => e.id))

    const filteredEntries = entries.filter((e) => !(cfg.agent as any)?.[e.id]?.disable)
    const infos = await Promise.all(filteredEntries.map(entryToInfo))

    // Add config-only agents (defined in config but not on disk)
    const configAgentMap = (cfg.agent as any) ?? {}
    for (const [agentId, agentCfg] of Object.entries(configAgentMap) as [string, any][]) {
      if (entryIds.has(agentId)) continue
      if (agentCfg.disable) continue
      infos.push(await configToInfo(agentId, agentCfg))
    }

    return pipe(
      infos,
      sortBy([(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"]),
    )
  }

  /**
   * Get default agent name
   */
  export async function defaultAgent(): Promise<string> {
    const cfg = await Config.get()
    const entries = await getEntries()
    const configAgentMap = (cfg.agent as any) ?? {}

    if (cfg.default_agent) {
      const agent = entries.find((e) => e.id === cfg.default_agent || e.config.name === cfg.default_agent)
      if (agent) {
        const agentCfg = configAgentMap[agent.id] as any
        const mode = agentCfg?.mode ?? agent.config.mode ?? "all"
        if (!isPrimaryMode(mode)) throw new Error(`default agent "${cfg.default_agent}" is not a primary agent`)
        if (agentCfg?.hidden ?? agent.config.hidden) throw new Error(`default agent "${cfg.default_agent}" is hidden`)
        return agent.id
      }
      const configAgent = configAgentMap[cfg.default_agent] as any
      if (configAgent && !configAgent.disable) {
        const mode = configAgent.mode ?? "all"
        if (!isPrimaryMode(mode)) throw new Error(`default agent "${cfg.default_agent}" is not a primary agent`)
        if (configAgent.hidden) throw new Error(`default agent "${cfg.default_agent}" is hidden`)
        return cfg.default_agent
      }
      throw new Error(`default agent "${cfg.default_agent}" not found`)
    }

    const primaryVisible = entries.find((e) => {
      if (configAgentMap[e.id]?.disable) return false
      const mode = (configAgentMap[e.id] as any)?.mode ?? e.config.mode ?? "all"
      return isPrimaryMode(mode) && !(configAgentMap[e.id]?.hidden ?? e.config.hidden)
    })
    if (!primaryVisible) throw new Error("no primary visible agent found")
    return primaryVisible.id
  }

  // ── File-based CRUD (delegates to @projectflows/agent) ───────────────────────

  export async function create(id: string, config: AgentStorage.Config, persona = "", injection = "") {
    const result = await AgentCore.create(agentBaseDir(), id, config, persona, injection)
    invalidateEntries()
    return result
  }

  export async function update(id: string, patch: Partial<AgentStorage.Config>, persona?: string, injection?: string) {
    const result = await AgentCore.update(agentBaseDir(), id, patch, persona, injection)
    invalidateEntries()
    // Sync skill permission rules when skills array is explicitly patched so
    // deriveEnabledSkills reflects the new list on the next agent load without
    // waiting for a re-seed (which only runs when no rules exist yet).
    if (patch.skills !== undefined) {
      const desired = new Set(patch.skills)
      const existing = PermissionNext.listRules("agent", id).filter((r) => r.resource === "skill")
      // Remove rules for skills no longer in the list
      for (const rule of existing) {
        if (!desired.has(rule.pattern)) {
          PermissionNext.removeRule(rule.id, "agent", id)
        }
      }
      // Add allow rules for newly added skills
      const existingPatterns = new Set(existing.map((r) => r.pattern))
      for (const name of desired) {
        if (!existingPatterns.has(name)) {
          PermissionNext.addRule({
            scope: "agent",
            scope_id: id,
            resource: "skill",
            access: "execute",
            pattern: name,
            action: "allow",
          })
        }
      }
    }
    return result
  }

  export async function remove(id: string) {
    const result = await AgentCore.remove(agentBaseDir(), id)
    invalidateEntries()
    return result
  }

  export async function getPersona(id: string) {
    return AgentCore.getPersona(agentBaseDir(), id)
  }

  export async function setPersona(id: string, text: string) {
    const result = await AgentCore.setPersona(agentBaseDir(), id, text)
    invalidateEntries()
    return result
  }

  export async function getInjection(id: string) {
    return AgentCore.getInjection(agentBaseDir(), id)
  }

  export async function setInjection(id: string, text: string) {
    const result = await AgentCore.setInjection(agentBaseDir(), id, text)
    invalidateEntries()
    return result
  }

  // ── AI generation ─────────────────────────────────────────────────────────

  export async function generate(input: { description: string; model?: { providerID: string; modelID: string } }) {
    const cfg = await Config.get()
    const defaultModel = input.model ?? (await Provider.defaultModel())
    const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
    const language = await Provider.getLanguage(model)

    const system = [PROMPT_GENERATE]
    const existing = await list()

    const result = await generateObject({
      experimental_telemetry: {
        isEnabled: cfg.experimental?.openTelemetry,
        metadata: {
          userId: cfg.username ?? "unknown",
        },
      },
      temperature: 0.3,
      messages: [
        ...system.map((item) => ({
          role: "system" as const,
          content: item,
        })),
        {
          role: "user" as const,
          content: `Create an agent configuration based on this request: \"${input.description}\".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
        },
      ],
      model: language as any,
      schema: z.object({
        identifier: z.string(),
        whenToUse: z.string(),
        systemPrompt: z.string(),
      }),
    })

    return result.object
  }
}
