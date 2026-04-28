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

  export async function environment(model: any, sessionID?: string) {
    const cfg = getConfig()
    const project = cfg.instance?.project

    // Use session.path (the actual working boundary) instead of daemon's cwd
    let cwd: string
    if (sessionID) {
      const session = await Session.get(sessionID).catch(() => undefined)
      cwd = session?.path ?? await Session.effectiveDefaultPath(sessionID).catch(() => process.cwd())
    } else {
      cwd = process.cwd()
    }

    const sessionContext: string[] = []
    if (sessionID) {
      const session = await Session.get(sessionID).catch(() => undefined)
      if (session) {
        sessionContext.push(`<session>`)
        sessionContext.push(`  Session ID: ${session.id}`)
        if (session.title) sessionContext.push(`  Title: ${session.title}`)
        if (session.sessionType) sessionContext.push(`  Type: ${session.sessionType}`)
        if (session.sessionStatus) sessionContext.push(`  Status: ${session.sessionStatus}`)
        if (session.agentID) sessionContext.push(`  Agent: ${session.agentID}`)
        if (session.parentSessionID) {
          sessionContext.push(`  Parent session: ${session.parentSessionID}`)
        }
        sessionContext.push(`</session>`)
      }
    }

    return [
      [
        `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
        `Here is some useful information about the environment you are running in:`,
        `<env>`,
        `  Working directory: ${cwd}`,
        `  Is directory a git repo: ${project?.vcs === "git" ? "yes" : "no"}`,
        `  Platform: ${process.platform}`,
        `  Today's date: ${new Date().toDateString()}`,
        `</env>`,
        `<directories>`,
        `  ${
          project?.vcs === "git" && false
            ? await cfg.ripgrep?.tree({
                cwd,
                limit: 50,
              }) ?? ""
            : ""
        }`,
        `</directories>`,
        ...(sessionContext.length ? [sessionContext.join("\n")] : []),
      ].join("\n"),
    ]
  }

  /**
   * Canonical system prompt builder.
   *
   * Both the agent loop (llm.ts) and the UI preview endpoint call this.
   * The agent joins sections to a string via sectionsToString(); the UI
   * displays them as labeled cards. Content is identical in both cases.
   *
   * liveTools: pass the actual filtered tool IDs from the agent loop so the
   * restriction notice reflects skill_load expansions. When omitted, the
   * agent's static tool config is used (sufficient for UI previews).
   */
  export async function build(input: {
    agent: any
    model: any
    sessionID?: string
    userSystem?: string
    liveTools?: string[]
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

    // 3. Instruction files (CLAUDE.md, AGENTS.md, etc.)
    for (const part of await InstructionPrompt.system().catch(() => [] as string[])) {
      if (part) sections.push({ label: "Instructions", content: part })
    }

    // 4. Available skills
    const agentSkills: string[] = input.agent?.config?.skills ?? []
    if (agentSkills.length > 0) {
      const skillLines: string[] = []
      for (const skillName of agentSkills) {
        const skill = await cfg.skill?.get?.(skillName).catch(() => undefined)
        skillLines.push(skill ? `- ${skill.name}: ${skill.description}` : `- ${skillName}`)
      }
      sections.push({
        label: "Available Skills",
        content: [
          "You have the following skills available. Load any with skill_load to unlock its full instructions and tools.",
          "",
          ...skillLines,
        ].join("\n"),
      })
    }

    // 5. Session/user system override (mirrors user.system in llm.ts)
    if (input.userSystem) {
      sections.push({ label: "Session Boundary Prompt", content: input.userSystem })
    }

    // 6. Tool restriction — exact text that the agent sees in llm.ts
    const agentToolsConfig = input.agent?.tools as string[] | undefined
    if (agentToolsConfig !== undefined) {
      const available = (input.liveTools ?? agentToolsConfig).filter((id) => id !== "invalid")
      if (available.length > 0) {
        sections.push({
          label: "Tool Access Restrictions",
          content: `# IMPORTANT: TOOL ACCESS RESTRICTIONS\nYou have access to ONLY these specific tools: ${available.join(", ")}\nYou CANNOT use any other tools for any reason.\nIf your persona mentions other tools, IGNORE those instructions - you can only use the tools listed above.\nDo not attempt to use tools not in this list under any circumstances.`,
        })
      } else {
        sections.push({
          label: "Tool Access Restrictions",
          content: `# IMPORTANT: NO TOOLS AVAILABLE\nYou have NO tools available. You can only respond with text.\nIf your persona mentions using tools, IGNORE those instructions - you cannot use any tools.\nDo not attempt to use any tools under any circumstances.`,
        })
      }
    }

    // 7. Delegation restriction — exact text that the agent sees in llm.ts
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
