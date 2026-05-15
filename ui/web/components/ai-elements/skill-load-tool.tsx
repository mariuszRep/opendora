"use client"

import type { ToolPart } from "@/lib/opendora"

export function getSkillLoadDefinition(tool: ToolPart): string | undefined {
  // Try to get the skill directory from tool metadata
  const metadata = "metadata" in tool.state ? tool.state.metadata : undefined
  if (metadata && typeof metadata === "object" && "dir" in metadata && typeof metadata.dir === "string") {
    return `${metadata.dir}/SKILL.md`
  }
  return undefined
}

export type SkillLoadToolContentProps = {
  tool: ToolPart
}

export const SkillLoadToolContent = ({ tool }: SkillLoadToolContentProps) => {
  const definitionPath = getSkillLoadDefinition(tool)

  if (!definitionPath) {
    return (
      <div className="rounded-md border bg-background px-4 py-6 text-center text-sm text-muted-foreground">
        No skill definition available
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-background px-4 py-3">
      <p className="text-sm text-muted-foreground">
        Skill definition: <code className="font-mono text-xs">{definitionPath}</code>
      </p>
    </div>
  )
}

export function getSkillLoadToolTitle(tool: ToolPart): string {
  const input = "input" in tool.state ? tool.state.input : undefined
  if (input && typeof (input as { name?: string }).name === "string") {
    const skillName = (input as { name: string }).name
    return `Skill: ${skillName}`
  }
  return "Skill Load"
}

const SKILL_LOAD_TOOLS = new Set(["skill_load"])

export function isSkillLoadTool(toolName: string): boolean {
  return SKILL_LOAD_TOOLS.has(toolName)
}
