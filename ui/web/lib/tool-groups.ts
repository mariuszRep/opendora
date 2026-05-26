export const HIDDEN_TOOLS = new Set(["invalid", "plan_exit"])

export const FILESYSTEM_TOOLS = new Set([
  "read", "write", "edit", "list", "glob", "grep",
  "apply_patch", "multiedit",
])

export const SHELL_TOOLS = new Set(["bash", "batch"])

export const BROWSE_AND_WEB_TOOLS = new Set(["webfetch", "websearch", "browser", "codesearch", "playwright_browser_mode"])

export const SESSION_TOOLS = new Set([
  "delegate", "reply", "notify", "question",
  "session_get", "session_search", "session_tree", "session_update",
])

export const AGENT_TOOLS = new Set([
  "agent_create", "agent_delete", "agent_get", "agent_list", "agent_update",
])

export const SKILL_TOOLS = new Set([
  "skill_list", "skill_load", "skill_search", "skill_install", "skill_create", "skill_edit", "skill_remove",
])

export const SCHEDULE_TOOLS = new Set([
  "schedule_list", "schedule_create", "schedule_update", "schedule_delete", "schedule_get", "schedule_run",
])

export const WORKFLOW_TOOLS = new Set([
  "workflow_run", "workflow_create", "workflow_get", "workflow_list", "workflow_update", "workflow_delete",
])

export const TOOL_REGISTRY_TOOLS = new Set([
  "tool_list", "tool_get", "tool_update",
])

export const MEMORY_TOOLS = new Set([
  "memory_read", "memory_write",
])

export const DESKTOP_TOOLS = new Set([
  "desktop_mouse_move", "desktop_mouse_click", "desktop_mouse_drag", "desktop_mouse_scroll", "desktop_mouse_position",
  "desktop_keyboard_type", "desktop_keyboard_press",
  "desktop_screen_capture", "desktop_screen_find_image", "desktop_screen_wait_for_image", "desktop_screen_size", "desktop_screen_read_pixel",
  "desktop_window_list", "desktop_window_active", "desktop_window_focus", "desktop_window_move", "desktop_window_resize",
  "desktop_clipboard_read", "desktop_clipboard_write",
])

export const isPyAutoGUI = (id: string) => id.startsWith("pyautogui_")

export type ToolGroupId =
  | "filesystem"
  | "shell"
  | "browse-and-web"
  | "sessions"
  | "agents"
  | "skills"
  | "schedule"
  | "workflows"
  | "tool-registry"
  | "memory"
  | "desktop"
  | "pyautogui"
  | "others"

export const TOOL_GROUP_ORDER: ToolGroupId[] = [
  "filesystem", "shell", "browse-and-web", "sessions", "agents", "skills",
  "schedule", "workflows", "tool-registry", "memory", "desktop", "pyautogui", "others",
]

export const TOOL_GROUP_LABELS: Record<ToolGroupId, string> = {
  "filesystem": "Filesystem",
  "shell": "Shell",
  "browse-and-web": "Browse & Web",
  "sessions": "Sessions",
  "agents": "Agents",
  "skills": "Skills",
  "schedule": "Schedule",
  "workflows": "Workflows",
  "tool-registry": "Tool Registry",
  "memory": "Memory",
  "desktop": "Desktop",
  "pyautogui": "PyAutoGUI",
  "others": "Others",
}

export function getToolGroup(id: string): ToolGroupId {
  if (FILESYSTEM_TOOLS.has(id)) return "filesystem"
  if (SHELL_TOOLS.has(id)) return "shell"
  if (BROWSE_AND_WEB_TOOLS.has(id)) return "browse-and-web"
  if (SESSION_TOOLS.has(id)) return "sessions"
  if (AGENT_TOOLS.has(id)) return "agents"
  if (SKILL_TOOLS.has(id)) return "skills"
  if (SCHEDULE_TOOLS.has(id)) return "schedule"
  if (WORKFLOW_TOOLS.has(id)) return "workflows"
  if (TOOL_REGISTRY_TOOLS.has(id)) return "tool-registry"
  if (MEMORY_TOOLS.has(id)) return "memory"
  if (DESKTOP_TOOLS.has(id)) return "desktop"
  if (isPyAutoGUI(id)) return "pyautogui"
  return "others"
}
