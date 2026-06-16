import { Agent } from "@opendora/runtime/agent"
import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
import type { Tool } from "@opendora/tools/tool"

export type DelegationRoute = "agent_main" | "existing_session" | "new_child_session" | "new_root_session"

export async function resolveAgentName(agent?: string) {
  if (!agent) return undefined
  const found = await Agent.get(agent)
  if (!found) throw new Error(`Unknown agent: ${agent}`)
  return found.name
}

export async function askDelegationPermission(
  ctx: Tool.Context,
  agent: string | undefined,
  description: string,
) {
  if (!agent) return
  await ctx.ask({
    permission: "task",
    patterns: [agent],
    always: ["*"],
    metadata: {
      description,
      subagent_type: agent,
    },
  })
}

export async function resolveDelegationTarget(input: {
  route: DelegationRoute
  agent?: string
  sessionID?: string
  title?: string
  description?: string
  sessionType?: "role" | "scope" | "worker" | "scratchpad"
  ctx: Tool.Context
}) {
  const targetAgentName =
    (await resolveAgentName(input.agent)) ??
    (input.sessionID ? (await Session.get(input.sessionID)).agentID : undefined)

  if (input.route === "existing_session") {
    if (!input.sessionID) throw new Error("session_id is required when route is existing_session")
    const session = await Session.get(input.sessionID)
    return { session, agent: targetAgentName, created: false }
  }

  if (input.route === "agent_main") {
    if (!targetAgentName) throw new Error("agent is required when route is agent_main")
    const session = await Session.ensureMainSession(targetAgentName)
    return { session, agent: targetAgentName, created: false }
  }

  if (!targetAgentName) throw new Error(`agent is required when route is ${input.route}`)

  const session = await Session.create({
    parentSessionID: input.route === "new_child_session" ? input.ctx.sessionID : undefined,
    title:
      input.title ??
      input.description ??
      `Delegated session (@${targetAgentName}${input.route === "new_root_session" ? " root" : " child"})`,
    sessionType: input.sessionType ?? (input.route === "new_root_session" ? "role" : "worker"),
    agentID: targetAgentName,
    ownerID: input.ctx.agent,
    ownerKind: "agent",
  })
  return { session, agent: targetAgentName, created: true }
}

export async function postDelegatedPrompt(input: {
  sessionID: string
  prompt: string
  waitForReply: boolean
  agent?: string
}) {
  const result = await SessionPrompt.prompt({
    sessionID: input.sessionID,
    ...(input.agent ? { agent: input.agent } : {}),
    noReply: !input.waitForReply,
    parts: await SessionPrompt.resolvePromptParts(input.prompt),
  })

  const text = (result.parts.findLast((part: any) => part.type === "text") as any)?.text ?? ""
  return { result, text }
}
