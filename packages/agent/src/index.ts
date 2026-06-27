/**
 * @projectflows/agent - Template-based agent management
 *
 * All agents are file-based with no "native" vs "file" distinction.
 * Default agents are seeded from templates on first run.
 */

import { AgentStorage } from "./storage"
import * as Templates from "./templates"

export { Templates, AgentStorage }
export type { AgentConfig, AgentTemplate } from "./templates/types"

export namespace Agent {
  export type Config = AgentStorage.Config
  export type Entry = AgentStorage.Entry

  // initialize() does a first-run check plus a template migration scan (filesystem
  // stat/read per template). It's idempotent, so once it has run for a given baseDir
  // in this process there's nothing left to do — without this guard, every single
  // Agent.get/list call (i.e. every chat message, often more than once) re-paid that
  // disk I/O for no reason.
  const initialized = new Set<string>()

  /**
   * Initialize agents - seed from templates on first run
   */
  export async function initialize(baseDir: string): Promise<void> {
    if (initialized.has(baseDir)) return
    initialized.add(baseDir)
    if (await AgentStorage.isFirstRun(baseDir)) {
      await AgentStorage.ensureRoot(baseDir)
      // Seed all templates
      for (const template of Templates.getAllTemplates()) {
        await AgentStorage.create(baseDir, template.id, template.config, template.persona, template.injection ?? "").catch(() => {
          // Skip if already exists
        })
      }
    } else {
      // Migration: Update existing template agents with injection if they're missing it
      await AgentStorage.ensureRoot(baseDir)
      for (const template of Templates.getAllTemplates()) {
        if (template.injection && await AgentStorage.exists(baseDir, template.id)) {
          const currentInjection = await AgentStorage.getInjection(baseDir, template.id).catch(() => "")
          // Only update if injection is missing or empty
          if (!currentInjection) {
            await AgentStorage.setInjection(baseDir, template.id, template.injection).catch(() => {
              // Ignore errors - agent might not exist or be locked
            })
            // Also update config to enable injection if not already set
            const agent = await AgentStorage.load(baseDir, template.id).catch(() => undefined)
            if (agent && !agent.config.enableInjection) {
              await AgentStorage.update(baseDir, template.id, { enableInjection: true }).catch(() => {
                // Ignore errors
              })
            }
          }
        }
      }

      // Migration: Add memory tools and memory-review skill to existing template agents
      const MEMORY_TOOLS = ["memory_read", "memory_write", "memory_delete"] as const
      for (const template of Templates.getAllTemplates()) {
        if (!await AgentStorage.exists(baseDir, template.id)) continue
        const agent = await AgentStorage.load(baseDir, template.id).catch(() => undefined)
        if (!agent) continue

        const patch: Partial<Config> = {}

        // Add any memory tools the template declares but the agent is missing
        const templateMemoryTools = (template.config.tools ?? []).filter(t => (MEMORY_TOOLS as readonly string[]).includes(t))
        if (templateMemoryTools.length > 0) {
          const currentTools = agent.config.tools ?? []
          const missing = templateMemoryTools.filter(t => !currentTools.includes(t))
          if (missing.length > 0) patch.tools = [...currentTools, ...missing]
        }

        // Add any skills the template declares but the agent is missing
        const templateSkills = template.config.skills ?? []
        if (templateSkills.length > 0) {
          const currentSkills = agent.config.skills ?? []
          const missingSkills = templateSkills.filter(s => !currentSkills.includes(s))
          if (missingSkills.length > 0) patch.skills = [...currentSkills, ...missingSkills]
        }

        if (Object.keys(patch).length > 0) {
          await AgentStorage.update(baseDir, template.id, patch).catch(() => {})
        }
      }
    }
  }

  /**
   * List all agents
   */
  export async function list(baseDir: string): Promise<Entry[]> {
    await initialize(baseDir)
    return AgentStorage.loadAll(baseDir)
  }

  /**
   * Get a single agent by ID
   */
  export async function get(baseDir: string, id: string): Promise<Entry | undefined> {
    await initialize(baseDir)
    return AgentStorage.load(baseDir, id).catch(() => undefined)
  }

  /**
   * Create a new agent
   */
  export async function create(baseDir: string, id: string, config: Config, persona = "", injection = ""): Promise<Entry> {
    await initialize(baseDir)
    const safeId = AgentStorage.toId(id)
    if (await AgentStorage.exists(baseDir, safeId)) {
      throw new Error(`Agent "${safeId}" already exists`)
    }
    return AgentStorage.create(baseDir, safeId, config, persona, injection)
  }

  /**
   * Update an existing agent
   */
  export async function update(baseDir: string, id: string, patch: Partial<Config>, persona?: string, injection?: string): Promise<Entry> {
    if (!(await AgentStorage.exists(baseDir, id))) {
      throw new Error(`Agent "${id}" not found`)
    }
    return AgentStorage.update(baseDir, id, patch, persona, injection)
  }

  /**
   * Delete an agent
   */
  export async function remove(baseDir: string, id: string): Promise<void> {
    return AgentStorage.remove(baseDir, id)
  }

  /**
   * Get agent persona
   */
  export async function getPersona(baseDir: string, id: string): Promise<string> {
    return AgentStorage.getPersona(baseDir, id)
  }

  /**
   * Set agent persona
   */
  export async function setPersona(baseDir: string, id: string, text: string): Promise<void> {
    if (!(await AgentStorage.exists(baseDir, id))) {
      throw new Error(`Agent "${id}" not found`)
    }
    return AgentStorage.setPersona(baseDir, id, text)
  }

  /**
   * Get agent injection
   */
  export async function getInjection(baseDir: string, id: string): Promise<string> {
    return AgentStorage.getInjection(baseDir, id)
  }

  /**
   * Set agent injection
   */
  export async function setInjection(baseDir: string, id: string, text: string): Promise<void> {
    if (!(await AgentStorage.exists(baseDir, id))) {
      throw new Error(`Agent "${id}" not found`)
    }
    return AgentStorage.setInjection(baseDir, id, text)
  }

  /**
   * Reset agent to template (if template exists)
   */
  export async function resetToTemplate(baseDir: string, id: string): Promise<Entry> {
    const template = Templates.getTemplate(id)
    if (!template) {
      throw new Error(`No template found for "${id}"`)
    }
    // Overwrite with template
    return AgentStorage.update(baseDir, id, template.config, template.persona, template.injection ?? "")
  }

  /**
   * Check if agent can be reset (has a template)
   */
  export function hasTemplate(id: string): boolean {
    return Templates.hasTemplate(id)
  }
}
