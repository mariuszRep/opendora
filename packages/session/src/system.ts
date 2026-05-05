import fs from "fs/promises"
import path from "path"
import { getConfig } from "./config.ts"
import { Session } from "./session.ts"
import { InstructionPrompt } from "./instruction.ts"

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

  export async function environment(model: any, sessionID?: string) {
    let session: Awaited<ReturnType<typeof Session.get>> | undefined
    if (sessionID) {
      session = await Session.get(sessionID).catch(() => undefined)
    }

    const lines: string[] = [
      `**Model:** ${model.api.id} \`${model.providerID}/${model.api.id}\``,
      `**Date:** ${new Date().toDateString()}`,
    ]

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
      if (session.agentID) lines.push(`- **Agent:** ${session.agentID}`)
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
    } else if (!input.isCodex) {
      for (const part of provider(input.model)) {
        if (part) sections.push({ label: "Base Prompt", content: part })
      }
    }

    // 2. Environment
    for (const part of await environment(input.model, input.sessionID)) {
      if (part) sections.push({ label: "Environment", content: part })
    }

    // 3. Instruction files (AGENTS.md, CLAUDE.md) — loaded from session cwd only
    const sessionCwd = input.sessionID
      ? await Session.get(input.sessionID).then((s) => s.cwd).catch(() => undefined)
      : undefined
    for (const part of await InstructionPrompt.system(sessionCwd).catch(() => [] as string[])) {
      if (part) sections.push({ label: "Instructions", content: part })
    }

    // 4. Available skills — auto-discovered from skill folder, no manual registration needed
    const agentTools = input.agent?.tools as string[] | undefined
    if (agentTools?.includes("skill_load")) {
      const allSkills = await cfg.skill?.all?.().catch(() => undefined)
      if (allSkills && allSkills.length > 0) {
        const skillLines = allSkills.map((s) => `- ${s.name}: ${s.description}`)
        sections.push({
          label: "Available Skills",
          content: [
            "You have the following skills available. Load any with skill_load to unlock its full instructions and tools.",
            "",
            ...skillLines,
          ].join("\n"),
        })
      }
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
        .map((a: any) => `- ${a.name}${a.description ? `: ${a.description}` : ""}`)
      if (entries.length > 0) {
        sections.push({
          label: "Delegation Restrictions",
          content: `# IMPORTANT: DELEGATION RESTRICTIONS\nYou may only delegate to the following agents:\n${entries.join("\n")}\nDo not delegate to any other agent. If your persona mentions other agents, disregard those names.`,
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
