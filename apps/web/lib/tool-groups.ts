export const HIDDEN_TOOLS = new Set(["invalid", "plan_exit"])

// Local type mirrors packages/tools/group-manifest.ts — web app cannot import packages directly.
export type ToolGroupId =
  | "filesystem"
  | "shell"
  | "web"
  | "browser"
  | "desktop"
  | "automation"
  | "sessions"
  | "memory"
  | "agents"
  | "skills"
  | "workflows"
  | "schedule"
  | "communication"
  | "delegation"
  | "system"
  | "tool-registry"
  | "others"

export type ToolGroupConfigField = {
  key: string
  label: string
  type: "text" | "password" | "boolean" | "path"
  description?: string
  placeholder?: string
}

export type ToolGroupManifest = {
  id: string
  name: string
  description: string
  icon: string
  sourceGroup?: string
  config?: { fields: ToolGroupConfigField[] }
  runtime?: { env?: string[]; secrets?: string[] }
  tools: string[]
  mcp?: { serverName?: string }
}

export const TOOL_GROUP_ORDER: ToolGroupId[] = [
  "filesystem", "shell", "web", "browser", "sessions", "agents", "skills",
  "schedule", "workflows", "tool-registry", "memory", "communication", "delegation",
  "desktop", "automation", "system", "others",
]

export const TOOL_GROUP_LABELS: Record<ToolGroupId, string> = {
  "filesystem": "Filesystem",
  "shell": "Shell",
  "web": "Web & Search",
  "browser": "Browser",
  "sessions": "Sessions",
  "agents": "Agents",
  "skills": "Skills",
  "schedule": "Schedule",
  "workflows": "Workflows",
  "tool-registry": "Tool Registry",
  "memory": "Memory",
  "communication": "Communication",
  "delegation": "Agent Delegation",
  "desktop": "Desktop",
  "automation": "Automation",
  "system": "System",
  "others": "Others",
}

// Fallback group resolution for tools that may lack a group field in their schema response.
// Canonical source of truth is the server-served group field from manifests.
export function getToolGroup(id: string): ToolGroupId {
  if (["read", "write", "edit", "list", "glob", "grep", "apply_patch", "multiedit"].includes(id)) return "filesystem"
  if (["bash", "batch"].includes(id)) return "shell"
  if (["webfetch", "websearch", "codesearch"].includes(id)) return "web"
  if (id === "playwright_browser_mode") return "browser"
  if (id.startsWith("desktop_")) return "desktop"
  if (id.startsWith("pyautogui_")) return "automation"
  if (["session_search", "session_get", "session_analyze", "session_tree", "session_update"].includes(id)) return "sessions"
  if (id.startsWith("agent__")) return "delegation"
  if (["question", "notify"].includes(id)) return "communication"
  if (["agent_create", "agent_update", "agent_delete", "agent_list", "agent_get"].includes(id)) return "agents"
  if (["skill_load", "skill_list", "skill_search", "skill_install", "skill_create", "skill_edit", "skill_remove"].includes(id)) return "skills"
  if (["schedule_list", "schedule_create", "schedule_update", "schedule_delete", "schedule_get", "schedule_run"].includes(id)) return "schedule"
  if (["workflow_run", "workflow_create", "workflow_get", "workflow_list", "workflow_update", "workflow_delete", "workflow_node_catalog"].includes(id)) return "workflows"
  if (id.startsWith("workflow__")) return "workflows"
  if (["tool_list", "tool_get", "tool_update"].includes(id)) return "tool-registry"
  if (["memory_read", "memory_write", "memory_delete"].includes(id)) return "memory"
  if (["todo_write", "log_lesson", "lsp", "invalid"].includes(id)) return "system"
  return "others"
}

// ── Source-group presentation utilities ───────────────────────────────────────

export function sourceGroupLabel(sg: string): string {
  if (sg === "core") return "Core"
  if (sg.startsWith("plugin:")) return sg.slice(7)
  if (sg.startsWith("mcp:")) return sg.slice(4)
  return sg
}

export function groupToolsBySource<T extends { sourceGroup?: string }>(tools: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const t of tools) {
    const sg = t.sourceGroup ?? "core"
    if (!groups.has(sg)) groups.set(sg, [])
    groups.get(sg)!.push(t)
  }
  return groups
}

export function sortSourceGroups(groups: string[]): string[] {
  return [...groups].sort((a, b) => {
    if (a === "core") return -1
    if (b === "core") return 1
    if (a.startsWith("mcp:") && !b.startsWith("mcp:")) return -1
    if (!a.startsWith("mcp:") && b.startsWith("mcp:")) return 1
    return a.localeCompare(b)
  })
}
