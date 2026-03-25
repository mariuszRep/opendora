import { host } from "../host.ts"
import type { Tool } from "../tool.ts"

export type DelegationRoute = "agent_main" | "existing_session" | "new_child_session" | "new_root_session"

export async function resolveAgentName(h: ReturnType<typeof host>, agentName?: string) {
  if (!agentName) return undefined
  if (!h.agents) throw new Error("agents service not available")
  const found = await h.agents.get(agentName) as any
  if (!found) throw new Error(`Unknown agent: ${agentName}`)
  return found.id as string
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
  h: ReturnType<typeof host>
}) {
  const { h } = input
  const sessionSvc = h.session as any
  if (!sessionSvc) throw new Error("session service not available")

  const targetAgentName =
    (await resolveAgentName(h, input.agent)) ??
    (input.sessionID ? (await sessionSvc.get(input.sessionID)).agentID : undefined)

  if (input.route === "existing_session") {
    if (!input.sessionID) throw new Error("session_id is required when route is existing_session")
    const session = await sessionSvc.get(input.sessionID)
    return { session, agent: targetAgentName, created: false }
  }

  if (input.route === "agent_main") {
    if (!targetAgentName) throw new Error("agent is required when route is agent_main")
    const session = await sessionSvc.ensureMainSession(targetAgentName)
    return { session, agent: targetAgentName, created: false }
  }

  if (!targetAgentName) throw new Error(`agent is required when route is ${input.route}`)

  const session = await sessionSvc.create({
    title:
      input.title ??
      input.description ??
      `Delegated session (@${targetAgentName}${input.route === "new_root_session" ? " root" : " child"})`,
    sessionType: input.sessionType ?? (input.route === "new_root_session" ? "role" : "worker"),
    agentID: targetAgentName,
    ownerID: input.ctx.agent,
    ownerKind: "agent",
    parentSessionID: input.ctx.sessionID,
  })
  return { session, agent: targetAgentName, created: true }
}

export async function postDelegatedPrompt(input: {
  sessionID: string
  prompt: string
  waitForReply: boolean
  agent?: string
  h: ReturnType<typeof host>
}) {
  const { h } = input
  const promptFn = h.prompt as any
  if (!promptFn) throw new Error("prompt service not available")
  const resolvePromptParts = h.resolvePromptParts
  if (!resolvePromptParts) throw new Error("resolvePromptParts service not available")

  const result = await promptFn({
    sessionID: input.sessionID,
    ...(input.agent ? { agent: input.agent } : {}),
    noReply: !input.waitForReply,
    parts: await resolvePromptParts(input.prompt),
  })

  const text = result.parts.findLast((part: any) => part.type === "text")?.text ?? ""
  return {
    result,
    text,
  }
}
