import { buildTemplate } from "./build"
import { planTemplate } from "./plan"
import { generalTemplate } from "./general"
import { exploreTemplate } from "./explore"
import { compactionTemplate } from "./compaction"
import { titleTemplate } from "./title"
import { summaryTemplate } from "./summary"
import { pmTemplate } from "./pm"
import { agentOwnerTemplate } from "./agent-owner"
import { productOwnerTemplate } from "./product-owner"
import type { AgentTemplate } from "./types"

export { AgentConfig, type AgentTemplate } from "./types"

/**
 * Default agent templates shipped with OpenDora.
 * These are used to seed .projectflows/agents/ on first run.
 */
export const templates: Record<string, AgentTemplate> = {
  build: buildTemplate,
  plan: planTemplate,
  general: generalTemplate,
  explore: exploreTemplate,
  compaction: compactionTemplate,
  title: titleTemplate,
  summary: summaryTemplate,
  pm: pmTemplate,
  "agent-owner": agentOwnerTemplate,
  "product-owner": productOwnerTemplate,
}

/**
 * Get all available templates
 */
export function getAllTemplates(): AgentTemplate[] {
  return Object.values(templates)
}

/**
 * Get a specific template by ID
 */
export function getTemplate(id: string): AgentTemplate | undefined {
  return templates[id]
}

/**
 * Check if a template exists
 */
export function hasTemplate(id: string): boolean {
  return id in templates
}
