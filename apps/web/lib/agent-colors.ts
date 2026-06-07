export const AGENT_COLORS = [
  { id: 'slate', label: 'Slate', hex: '#64748b' },
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'yellow', label: 'Yellow', hex: '#eab308' },
  { id: 'lime', label: 'Lime', hex: '#84cc16' },
  { id: 'green', label: 'Green', hex: '#22c55e' },
  { id: 'emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'teal', label: 'Teal', hex: '#14b8a6' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'sky', label: 'Sky', hex: '#0ea5e9' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'indigo', label: 'Indigo', hex: '#6366f1' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { id: 'purple', label: 'Purple', hex: '#a855f7' },
  { id: 'fuchsia', label: 'Fuchsia', hex: '#d946ef' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
  { id: 'rose', label: 'Rose', hex: '#f43f5e' },
] as const

export type AgentColorId = typeof AGENT_COLORS[number]['id']

export function getAgentColor(colorId?: string | null) {
  return AGENT_COLORS.find((c) => c.id === colorId) ?? AGENT_COLORS[0]
}
