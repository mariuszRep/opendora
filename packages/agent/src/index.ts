/**
 * @projectflows/agent - Agent storage and lifecycle management
 *
 * Agent content (default personas, tools, system agents like compaction/title/
 * summary) is sourced entirely from plugin install — see projectflows-website's
 * registry (agents-default, agent-core plugins). This package only manages
 * what's already on disk; it never seeds or migrates hardcoded content.
 */

import { AgentStorage } from "./storage"

export { AgentStorage }

export namespace Agent {
  export type Config = AgentStorage.Config
  export type Entry = AgentStorage.Entry

  // Ensures the agents root directory exists. Idempotent per baseDir per process
  // (mkdir is cheap, but this avoids a redundant fs call on every single
  // Agent.get/list — i.e. every chat message, often more than once).
  const rootEnsured = new Set<string>()

  async function ensureInitialized(baseDir: string): Promise<void> {
    if (rootEnsured.has(baseDir)) return
    rootEnsured.add(baseDir)
    await AgentStorage.ensureRoot(baseDir)
  }

  /**
   * List all agents
   */
  export async function list(baseDir: string): Promise<Entry[]> {
    await ensureInitialized(baseDir)
    return AgentStorage.loadAll(baseDir)
  }

  /**
   * Get a single agent by ID
   */
  export async function get(baseDir: string, id: string): Promise<Entry | undefined> {
    await ensureInitialized(baseDir)
    return AgentStorage.load(baseDir, id).catch(() => undefined)
  }

  /**
   * Create a new agent
   */
  export async function create(baseDir: string, id: string, config: Config, persona = "", injection = ""): Promise<Entry> {
    await ensureInitialized(baseDir)
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
}
