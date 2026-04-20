/**
 * Agent management for OpenCode
 * Now powered by @opendora/agent with template-based agents
 */
import z from "zod"
import { Agent as AgentCore, AgentStorage } from "@opendora/agent"
import { Instance } from "./project/instance"
import { PermissionNext } from "@/permission/next"
import { Provider } from "@opendora/provider/provider"
import { generateObject } from "ai"
import { Config } from "./config/config"
import { Truncate } from "./tool/truncation"
import { Skill } from "./skill"
import path from "path"
import { pipe, sortBy, values } from "remeda"
import { Flag } from "./flag/flag"

import PROMPT_GENERATE from "./generate.txt"

export namespace Agent {
  const PRIMARY_AGENT_MODES = new Set(["primary", "all"] as const)
  const WORKER_AGENT_MODES = new Set(["worker", "subagent", "all"] as const)

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
      permission: PermissionNext.Ruleset,
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
      enableInjection: z.boolean().optional(),
      config: AgentStorage.Config.optional(),
    })
    .meta({
      ref: "Agent",
    })
  export type Info = z.infer<typeof Info>

  /**
   * Build default permissions for agents
   */
  async function buildDefaultPermissions(): Promise<PermissionNext.Ruleset> {
    const cfg = await Config.get()
    const skillDirs = await Skill.dirs()
    const whitelistedDirs = [Truncate.GLOB, ...skillDirs.map((dir) => path.join(dir, "*"))]

    const defaults = PermissionNext.fromConfig({
      "*": "allow",
      doom_loop: "ask",
      external_directory: {
        "*": "ask",
        ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
      },
      question: "deny",
      plan_enter: "deny",
      plan_exit: "deny",
      read: {
        "*": "allow",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
      // Agent management permissions - allow agents to manage other agents by default
      agent_create: "allow",
      agent_update: "allow", 
      agent_delete: "ask", // Deletion is destructive, so ask by default
      agent_list: "allow",
      agent_get: "allow",
    })

    const user = PermissionNext.fromConfig(cfg.permission ?? {})
    return PermissionNext.merge(defaults, user)
  }

  /**
   * Convert storage entry to Info with permissions
   */
  async function entryToInfo(entry: AgentStorage.Entry): Promise<Info> {
    const defaults = await buildDefaultPermissions()

    // User's tool selection is ALWAYS respected:
    // - tools: ["bash", "read"] -> only bash and read
    // - tools: [] -> NO tools
    // - tools: undefined -> NO OVERRIDE, use default permissions
    
    // Merge agent-specific permissions with defaults
    // Agent permissions take precedence (they come last in merge)
    let permission = defaults
    if (entry.config.permission && Array.isArray(entry.config.permission)) {
      permission = PermissionNext.merge(defaults, entry.config.permission as PermissionNext.Ruleset)
    }

    // Auto-inject path.write / path.read rules from defaultPaths so that path
    // boundaries are first-class permission rules rather than side-channel fields.
    const projectPath = entry.config.defaultPaths?.[0]
    if (projectPath) {
      permission = PermissionNext.merge(permission, [
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
      prompt: entry.persona || undefined,
      model: entry.config.model,
      permission,
      options: {},
      enableInjection: entry.config.enableInjection,
      config: entry.config,
    }
  }

  function agentBaseDir() {
    return Flag.OPENCODE_CONFIG_DIR ? path.dirname(Flag.OPENCODE_CONFIG_DIR) : Instance.directory
  }

  /**
   * Get a single agent by ID
   */
  export async function get(agent: string): Promise<Info | undefined> {
    const entry = await AgentCore.get(agentBaseDir(), agent)
    if (!entry) return undefined
    return entryToInfo(entry)
  }

  /**
   * Get agent by ID or name (for backward compatibility with legacy data)
   * Tries ID first, then falls back to searching by name
   */
  export async function getByIdOrName(agentIdOrName: string): Promise<Info | undefined> {
    // Try by ID first
    let entry = await AgentCore.get(agentBaseDir(), agentIdOrName)
    if (entry) return entryToInfo(entry)

    // Fallback: search by name for legacy data
    const entries = await AgentCore.list(agentBaseDir())
    entry = entries.find((e) => e.config.name === agentIdOrName)
    if (!entry) return undefined
    return entryToInfo(entry)
  }

  /**
   * List all agents
   */
  export async function list(): Promise<Info[]> {
    const cfg = await Config.get()
    const entries = await AgentCore.list(agentBaseDir())
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
    const entries = await AgentCore.list(agentBaseDir())

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
    return AgentCore.create(agentBaseDir(), id, config, persona, injection)
  }

  export async function update(id: string, patch: Partial<AgentStorage.Config>, persona?: string, injection?: string) {
    return AgentCore.update(agentBaseDir(), id, patch, persona, injection)
  }

  export async function remove(id: string) {
    return AgentCore.remove(agentBaseDir(), id)
  }

  export async function getPersona(id: string) {
    return AgentCore.getPersona(agentBaseDir(), id)
  }

  export async function setPersona(id: string, text: string) {
    return AgentCore.setPersona(agentBaseDir(), id, text)
  }

  export async function getInjection(id: string) {
    return AgentCore.getInjection(agentBaseDir(), id)
  }

  export async function setInjection(id: string, text: string) {
    return AgentCore.setInjection(agentBaseDir(), id, text)
  }

  export async function resetToTemplate(id: string) {
    return AgentCore.resetToTemplate(agentBaseDir(), id)
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
