/**
 * Agent management for OpenCode
 * Now powered by @opendora/agent with template-based agents
 */
import z from "zod"
import { Agent as AgentCore, AgentStorage } from "@opendora/agent"
import { Instance } from "@opendora/runtime/instance"
import { PermissionNext } from "@opendora/permission/next"
import { Provider } from "@opendora/provider/provider"
import { generateObject } from "ai"
import { Config } from "@opendora/config/config"
import path from "path"
import { pipe, sortBy } from "remeda"
import { Flag } from "@opendora/util/flag"
import { Global } from "@opendora/util/global"
import { Skill } from "@opendora/skills/skill"

import PROMPT_GENERATE from "./generate.txt"

export namespace Agent {
  const PRIMARY_AGENT_MODES = new Set(["primary", "all"] as const)
  const WORKER_AGENT_MODES = new Set(["worker", "subagent", "all"] as const)

  // Matches Truncate.GLOB from @opendora/tools (tool-output dir glob)
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
   * Build default permissions for agents
   */
  async function buildDefaultPermissions(): Promise<PermissionNext.LegacyRuleset> {
    const cfg = await Config.get()
    const skillDirs = await Skill.dirs()
    const whitelistedDirs = [TRUNCATE_GLOB, ...skillDirs.map((dir) => path.join(dir, "*"))]

    const defaults = PermissionNext.fromConfig({
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

    const user = PermissionNext.fromConfig(cfg.permission ?? {})
    return PermissionNext.merge(defaults, user)
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

  /**
   * Convert storage entry to Info with permissions
   */
  async function entryToInfo(entry: AgentStorage.Entry): Promise<Info> {
    const defaults = await buildDefaultPermissions()
    const enabledSkills = await deriveEnabledSkills(entry)
    // Keep config.skills consistent with the rule-derived set so downstream
    // readers (system prompt, skill_list, skill_load) reflect permission rules.
    entry.config.skills = enabledSkills

    // User's tool selection is ALWAYS respected:
    // - tools: ["bash", "read"] -> only bash and read
    // - tools: [] -> NO tools
    // - tools: undefined -> NO OVERRIDE, use default permissions

    // Auto-inject path.write / path.read rules from defaultPaths so that path
    // boundaries are first-class permission rules rather than side-channel fields.
    let permission = defaults
    const projectPath = entry.config.defaultPaths?.[0]
    if (projectPath) {
      permission = PermissionNext.merge(defaults, [
        { permission: "path.write", pattern: projectPath, action: "allow" },
        { permission: "path.read", pattern: projectPath, action: "allow" },
      ])
    }

    return {
      id: entry.id,
      name: entry.config.name,
      description: entry.config.description,
      mode: entry.config.mode ?? "all",
      native: false, // All agents are file-based now
      hidden: entry.config.hidden,
      temperature: entry.config.temperature,
      steps: entry.config.steps,
      color: entry.config.color,
      tools: entry.config.tools,
      skills: entry.config.skills,
      workflows: entry.config.workflows,
      prompt: entry.persona || undefined,
      model: entry.config.model,
      permission,
      options: {},
      enableInjection: entry.config.enableInjection,
      injectInstructions: entry.config.injectInstructions,
      config: entry.config,
    }
  }

  function agentBaseDir() {
    return Flag.OPENCODE_CONFIG_DIR ? path.dirname(Flag.OPENCODE_CONFIG_DIR) : Instance.directory
  }

  // Agent definitions are file-based (one agent.json + PERSONA.md read per agent).
  // get/getByIdOrName/list/defaultAgent were each independently re-reading every
  // agent off disk — every chat message resolves the agent at least twice, so
  // this was paying that I/O multiple times per message. Cache the raw entries
  // per baseDir and invalidate on any write (create/update/remove/setPersona/
  // setInjection/resetToTemplate are the only writers, all in this file).
  const entriesCache = new Map<string, Promise<AgentCore.Entry[]>>()

  function getEntries(): Promise<AgentCore.Entry[]> {
    const baseDir = agentBaseDir()
    let cached = entriesCache.get(baseDir)
    if (!cached) {
      cached = AgentCore.list(baseDir)
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
    const entries = await getEntries()
    const entry = entries.find((e) => e.id === agent)
    if (!entry) return undefined
    return entryToInfo(entry)
  }

  /**
   * Get agent by ID or name (for backward compatibility with legacy data)
   * Tries ID first, then falls back to searching by name
   */
  export async function getByIdOrName(agentIdOrName: string): Promise<Info | undefined> {
    const entries = await getEntries()
    const entry = entries.find((e) => e.id === agentIdOrName) ?? entries.find((e) => e.config.name === agentIdOrName)
    if (!entry) return undefined
    return entryToInfo(entry)
  }

  /**
   * List all agents
   */
  export async function list(): Promise<Info[]> {
    const cfg = await Config.get()
    const entries = await getEntries()
    const infos = await Promise.all(entries.map(entryToInfo))

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

    if (cfg.default_agent) {
      const agent = entries.find((e) => e.config.name === cfg.default_agent)
      if (!agent) throw new Error(`default agent "${cfg.default_agent}" not found`)
      const mode = agent.config.mode ?? "all"
      if (!isPrimaryMode(mode)) throw new Error(`default agent "${cfg.default_agent}" is not a primary agent`)
      if (agent.config.hidden) throw new Error(`default agent "${cfg.default_agent}" is hidden`)
      return agent.id
    }

    const primaryVisible = entries.find((e) => {
      const mode = e.config.mode ?? "all"
      return isPrimaryMode(mode) && !e.config.hidden
    })
    if (!primaryVisible) throw new Error("no primary visible agent found")
    return primaryVisible.id
  }

  // ── File-based CRUD (delegates to @opendora/agent) ───────────────────────

  export async function create(id: string, config: AgentStorage.Config, persona = "", injection = "") {
    const result = await AgentCore.create(agentBaseDir(), id, config, persona, injection)
    invalidateEntries()
    return result
  }

  export async function update(id: string, patch: Partial<AgentStorage.Config>, persona?: string, injection?: string) {
    const result = await AgentCore.update(agentBaseDir(), id, patch, persona, injection)
    invalidateEntries()
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

  export async function resetToTemplate(id: string) {
    const result = await AgentCore.resetToTemplate(agentBaseDir(), id)
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
      model: language,
      schema: z.object({
        identifier: z.string(),
        whenToUse: z.string(),
        systemPrompt: z.string(),
      }),
    })

    return result.object
  }
}
