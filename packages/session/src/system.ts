import { getConfig } from "./config.ts"
import { Session } from "./session.ts"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_ANTHROPIC_WITHOUT_TODO from "./prompt/qwen.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_CODEX from "./prompt/codex_header.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"

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
    const cwd = sessionID ? await Session.effectiveDefaultPath(sessionID).catch(() => cfg.instance?.directory ?? process.cwd()) : cfg.instance?.directory ?? process.cwd()

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
        if (session.replyToSessionID) {
          sessionContext.push(`  Reply expected: silent`)
          sessionContext.push(`  Reply to session ID: ${session.replyToSessionID}`)
          sessionContext.push(`  When your task is complete, use the reply tool (not delegate) to post your result.`)
          sessionContext.push(`  reply posts silently — it does NOT trigger the LLM in the target session.`)
          sessionContext.push(`  The caller will see your message and decide what to do next.`)
        } else if (session.parentSessionID) {
          sessionContext.push(`  When done, use the reply tool to post your result back to the parent session.`)
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
}
