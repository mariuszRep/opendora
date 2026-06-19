import fs from "fs/promises"
import path from "path"
import { getConfig } from "./config.ts"
import { Session } from "./session.ts"
import { InstructionPrompt } from "./instruction.ts"

// Memory helpers — inlined to avoid a runtime dep on @opendora/tools (devDep only)
interface MemoryEntry { name: string; description: string; type: string; content: string; createdAt: number; updatedAt: number }
function parseMemoryEntries(raw: string): MemoryEntry[] {
  try { return raw ? JSON.parse(raw) : [] } catch { return [] }
}
function serializeMemoryEntries(entries: MemoryEntry[]): string {
  return entries.map(e => `---\nname: ${e.name}\ndescription: ${e.description}\ntype: ${e.type}\n---\n${e.content}`).join("\n\n")
}
async function findProjectFlowsDir(startDir: string): Promise<string> {
  let dir = startDir
  while (true) {
    const candidate = path.join(dir, ".projectflows")
    try { const s = await fs.stat(candidate); if (s.isDirectory()) return candidate } catch {}
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error("No .projectflows directory found")
    dir = parent
  }
}
async function readMemoryFile(filePath: string): Promise<string> {
  try { return await fs.readFile(filePath, "utf-8") } catch { return "" }
}

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_ANTHROPIC_WITHOUT_TODO from "./prompt/qwen.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_CODEX from "./prompt/codex_header.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"

export type PromptSection = {
  label: string
  content: string
}

export namespace SystemPrompt {
  export function instructions() {
    return PROMPT_CODEX.trim()
  }

  export function provider(model: any) {
    if (model.api.id.includes("gpt-5")) return [PROMPT_CODEX]
    if (model.api.id.includes("gpt-") || model.api.id.includes("o1") || model.api.id.includes("o3"))
      return [PROMPT_BEAST]
    if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
    if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
    if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
    return [PROMPT_ANTHROPIC_WITHOUT_TODO]
  }

  async function isGitRepo(dir: string): Promise<boolean> {
    let current = path.resolve(dir)
    while (true) {
      try {
        await fs.access(path.join(current, ".git"))
        return true
      } catch {}
      const parent = path.dirname(current)
      if (parent === current) return false
      current = parent
    }
  }

  export async function environment(model: any, sessionID?: string, agent?: any) {
    let session: Awaited<ReturnType<typeof Session.get>> | undefined
    if (sessionID) {
      session = await Session.get(sessionID).catch(() => undefined)
    }

    const lines: string[] = [
      `**Date:** ${new Date().toDateString()}`,
    ]

    if (agent) {
      lines.push(``, `**Agent**`, ``)
      lines.push(`- **ID:** \`${agent.id}\``)
      lines.push(`- **Name:** ${agent.name}`)
      if (agent.description) lines.push(`- **Description:** ${agent.description}`)
      lines.push(`- **Model:** ${model.api.id} \`${model.providerID}/${model.api.id}\``)
    } else {
      lines.push(`**Model:** ${model.api.id} \`${model.providerID}/${model.api.id}\``)
    }

    if (session?.cwd) {
      const git = await isGitRepo(session.cwd).catch(() => false)
      lines.push(
        ``,
        `- **Working directory:** \`${session.cwd}\``,
        `- **Platform:** ${process.platform}`,
        `- **Git repo:** ${git ? "yes" : "no"}`,
      )
    }

    if (session) {
      lines.push(``, `**Session**`, ``)
      lines.push(`- **ID:** \`${session.id}\``)
      if (session.title) lines.push(`- **Title:** ${session.title}`)
      if (session.sessionType || session.sessionStatus)
        lines.push(`- **Type:** ${session.sessionType ?? "—"} · **Status:** ${session.sessionStatus ?? "—"}`)
      if (session.parentSessionID) lines.push(`- **Parent:** \`${session.parentSessionID}\``)
    }

    return [lines.join("\n")]
  }

  /**
   * Canonical system prompt builder.
   *
   * Both the agent loop (llm.ts) and the UI preview endpoint call this.
   * The agent joins sections to a string via sectionsToString(); the UI
   * displays them as labeled cards. Content is identical in both cases.
   */
  export async function build(input: {
    agent: any
    model: any
    sessionID?: string
    userSystem?: string
    isCodex?: boolean
  }): Promise<PromptSection[]> {
    const cfg = getConfig()
    const sections: PromptSection[] = []

    // 1. Agent persona OR provider base prompt
    if (input.agent?.prompt) {
      sections.push({ label: "Agent Persona", content: input.agent.prompt })
    } else if (!input.agent && !input.isCodex) {
      for (const part of provider(input.model)) {
        if (part) sections.push({ label: "Base Prompt", content: part })
      }
    }

    // 2. Environment
    for (const part of await environment(input.model, input.sessionID, input.agent)) {
      if (part) sections.push({ label: "Environment", content: part })
    }

    // 3. Instruction files (AGENTS.md, CLAUDE.md) — loaded from session cwd only
    // Skipped when agent explicitly sets injectInstructions: false
    if (input.agent?.injectInstructions !== false) {
      const sessionCwd = input.sessionID
        ? await Session.get(input.sessionID).then((s) => s.cwd).catch(() => undefined)
        : undefined
      for (const part of await InstructionPrompt.system(sessionCwd).catch(() => [] as string[])) {
        if (part) sections.push({ label: "Instructions", content: part })
      }
    }

    // 3.5 Agent Memories — inject prior session memories when agent has memory_read
    const hasMemoryTool = (input.agent?.tools as string[] | undefined)?.includes("memory_read") ?? false
    if (hasMemoryTool) {
      const memSession = input.sessionID ? await Session.get(input.sessionID).catch(() => undefined) : undefined
      // Resolution order: session cwd → session directory (most reliable, always set in DB)
      // → cfg.instance?.directory (may throw if no AsyncLocalStorage context in HTTP requests)
      const instanceDir = (() => { try { return cfg.instance?.directory } catch { return undefined } })()
      const candidates = [memSession?.cwd, memSession?.directory, instanceDir].filter(Boolean) as string[]
      let pfDir: string | undefined
      for (const candidate of candidates) {
        const found = await findProjectFlowsDir(candidate).catch(() => null)
        if (found) { pfDir = found; break }
      }
      if (pfDir) {
        const agentId = input.agent?.id ?? ""
        const [globalRaw, localRaw] = await Promise.all([
          readMemoryFile(path.join(pfDir, "agents", "MEMORY.json")),
          readMemoryFile(path.join(pfDir, "agents", agentId, "MEMORY.json")),
        ])
        const globalEntries = parseMemoryEntries(globalRaw)
        const localEntries = parseMemoryEntries(localRaw)
        if (globalEntries.length > 0 || localEntries.length > 0) {
          const parts: string[] = ["# Memories\n\nThese memories from previous sessions inform your current task. Review them before acting."]
          if (globalEntries.length > 0) parts.push(`\n## Global\n\n${serializeMemoryEntries(globalEntries)}`)
          if (localEntries.length > 0) parts.push(`\n## Agent-specific\n\n${serializeMemoryEntries(localEntries)}`)
          sections.push({ label: "Memories", content: parts.join("") })
        }
      }
    }

    // 4. Available Skills — list assigned skills so the agent knows what to load
    const agentToolsList = input.agent?.tools as string[] | undefined
    const hasSkillLoadTool = agentToolsList?.includes("skill_load") ?? false
    if (hasSkillLoadTool) {
      const agentSkillNames = input.agent?.config?.skills as string[] | undefined
      const allSkills: any[] = await cfg.skill?.all?.() ?? []
      const visibleSkills = agentSkillNames?.length
        ? allSkills.filter((s: any) => agentSkillNames.includes(s.name))
        : []
      if (visibleSkills.length > 0) {
        const rows = visibleSkills.map((s: any) => `| ${s.name} | ${(s.description ?? "").replace(/\|/g, "\\|")} |`)
        const table = ["| Name | Description |", "| --- | --- |", ...rows].join("\n")
        sections.push({
          label: "Available Skills",
          content: `# Available Skills\nUse the \`skill_load\` tool to load any of these skills when the task matches:\n\n${table}`,
        })
      }
    }

    // 4b. Available Workflows — list assigned workflows so the agent knows what to run
    const hasWorkflowRunTool = agentToolsList?.includes("workflow_run") ?? false
    if (hasWorkflowRunTool) {
      const agentWorkflowIds = input.agent?.config?.workflows as string[] | undefined
      if (agentWorkflowIds?.length) {
        const allWorkflows: any[] = await cfg.workflow?.list?.() ?? []
        const visibleWorkflows = allWorkflows.filter((w: any) => agentWorkflowIds.includes(w.id))
        // Include any assigned ids that didn't resolve, so the agent still sees them
        const resolvedIds = new Set(visibleWorkflows.map((w: any) => w.id))
        const unresolved = agentWorkflowIds.filter((id) => !resolvedIds.has(id))

        const hasParams = (w: any): boolean => {
          const paramNode = (w.nodes ?? []).find((n: any) => n.data?.nodeType === "parameters")
          return ((paramNode?.data?.workflowParameters ?? []) as any[]).length > 0
        }

        const resolvedRows = visibleWorkflows.map((w: any) => {
          const name = w.name && w.name !== w.id ? `${w.id} (${w.name})` : w.id
          const desc = (w.description ?? "").replace(/\|/g, "\\|")
          return `| ${name} | ${desc} | ${hasParams(w) ? "Yes" : "No"} |`
        })
        const unresolvedRows = unresolved.map((id) => `| ${id} | | |`)
        const allRows = [...resolvedRows, ...unresolvedRows]

        if (allRows.length > 0) {
          const table = ["| Workflow | Description | Has Parameters |", "| --- | --- | --- |", ...allRows].join("\n")
          sections.push({
            label: "Available Workflows",
            content: `# Available Workflows\nIf a workflow shows **Yes** in the "Has Parameters" column, call \`workflow_parameters\` with the workflow ID before calling \`workflow_run\`.\n\n${table}`,
          })
        }
      }
    }

    // 4c. Directory Permissions — show allowed directories from path.read/path.write rules
    // Also show session working directory and path boundaries even without explicit rules
    const dirRows: string[] = []
    let hasDirInfo = false

    // Add session working directory if available
    if (input.sessionID) {
      const session = await Session.get(input.sessionID).catch(() => undefined)
      if (session?.cwd) {
        dirRows.push(`| ${session.cwd} | working directory |`)
        hasDirInfo = true
      }
      if (session?.path) {
        dirRows.push(`| ${session.path} | write boundary |`)
        hasDirInfo = true
      }
      if (session?.readPath && session.readPath !== session.path) {
        dirRows.push(`| ${session.readPath} | read boundary |`)
        hasDirInfo = true
      }
    }

    // Add explicit path permission rules if available
    if (input.agent?.permission && cfg.permissionNext?.extractPathBoundaries) {
      const pathBoundaries = cfg.permissionNext.extractPathBoundaries(input.agent.permission)
      
      // Add write paths
      for (const writePath of pathBoundaries.writePaths) {
        if (!dirRows.some((row) => row.includes(writePath))) {
          dirRows.push(`| ${writePath} | write |`)
          hasDirInfo = true
        }
      }
      
      // Add read path if different from write paths
      if (pathBoundaries.readPath && !pathBoundaries.writePaths.includes(pathBoundaries.readPath)) {
        if (!dirRows.some((row) => row.includes(pathBoundaries.readPath))) {
          dirRows.push(`| ${pathBoundaries.readPath} | read |`)
          hasDirInfo = true
        }
      }
    }
    
    if (hasDirInfo) {
      const table = ["| Path | Access |", "| --- | --- |", ...dirRows].join("\n")
      sections.push({
        label: "Directory Permissions",
        content: `# Directory Permissions\nYou have the following directory access permissions:\n\n${table}`,
      })
    }

    // 5. Session/user system override (mirrors user.system in llm.ts)
    if (input.userSystem) {
      sections.push({ label: "Session Boundary Prompt", content: input.userSystem })
    }

    // 6. Delegation restriction — exact text that the agent sees in llm.ts
    const agentToolsConfig = input.agent?.tools as string[] | undefined
    const hasDelegateTool = agentToolsConfig?.includes("delegate")
    const allowedAgentNames: string[] | undefined = hasDelegateTool
      ? input.agent?.config?.toolConfig?.delegate?.allowedAgents
      : undefined
    if (allowedAgentNames && allowedAgentNames.length > 0) {
      const allAgents = await cfg.agent?.list?.() ?? []
      const entries = (allAgents as any[])
        .filter((a) => allowedAgentNames.includes(a.name))
        .map((a: any) => `- **${a.name}**${a.description ? `: ${a.description}` : ""}`)
      if (entries.length > 0) {
        sections.push({
          label: "Available Delegations",
          content: `${entries.join("\n")}`,
        })
      }
    }

    return sections
  }

  /** Joins section content into the single string the model receives. */
  export function sectionsToString(sections: PromptSection[]): string {
    return sections.map((s) => s.content).filter(Boolean).join("\n")
  }
}
