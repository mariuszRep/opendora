import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./spawn_session.txt"
import { askDelegationPermission, postDelegatedPrompt, resolveDelegationTarget } from "./delegation"

const RouteSchema = z.enum(["new_child_session", "new_root_session"])

const parameters = z.object({
  route: RouteSchema.describe("Whether to create a child session or a new root session"),
  agent: z.string().describe("Target agent to assign to the new session"),
  prompt: z.string().describe("Message to send to the newly created session"),
  description: z.string().describe("Short label for this delegation").optional(),
  title: z.string().describe("Optional title for the new session").optional(),
  session_type: z.enum(["role", "scope", "worker", "scratchpad"]).optional(),
  wait_for_reply: z.boolean().describe("Wait for a reply from the new session. Default: true.").optional(),
})

export const SpawnSessionTool = Tool.define("spawn_session", {
  description: DESCRIPTION,
  parameters,
  async execute(params, ctx) {
    const waitForReply = params.wait_for_reply ?? true
    const { session, agent, created } = await resolveDelegationTarget({
      route: params.route,
      agent: params.agent,
      title: params.title,
      description: params.description,
      sessionType: params.session_type,
      ctx,
    })
    await askDelegationPermission(ctx, agent, params.description ?? `Spawn ${params.route} for ${agent}`)
    const { result, text } = await postDelegatedPrompt({
      sessionID: session.id,
      prompt: params.prompt,
      waitForReply,
      agent,
    })

    return {
      title: params.description ?? `Spawned session for ${agent}`,
      metadata: {
        sessionId: session.id,
        agent,
        route: params.route,
        created,
        replied: waitForReply,
        messageId: result.info.id,
      },
      output: waitForReply
        ? [`route: ${params.route}`, `session_id: ${session.id}`, `agent: ${agent}`, `created: yes`, "", "<pong>", text, "</pong>"].join("\n")
        : [`route: ${params.route}`, `session_id: ${session.id}`, `message_id: ${result.info.id}`, `agent: ${agent}`, `created: yes`, "status: ping posted"].join("\n"),
    }
  },
})
