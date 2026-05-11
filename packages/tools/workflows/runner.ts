/**
 * Workflow runner — drives deterministic execution of a workflow graph within a session.
 *
 * Deterministic nodes (input, skill_load, tool_call, output) are executed server-side and
 * injected directly into the session as service messages so they appear in the session
 * timeline without consuming an LLM round-trip.
 *
 * Agent nodes (agent, decide) send a prompt via SessionPrompt and wait for the response
 * before continuing — exactly like a normal conversation turn.
 */

import fs from "fs/promises"
import path from "path"
import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
import { Identifier } from "@opendora/util/id"
import { Workflow, WorkflowEdge, resolveRefs, resolveTemplate } from "./schema.ts"

type Ctx = Record<string, unknown>

type InjectedPart =
  | { type: "text"; text: string }
  | { type: "tool"; tool: string; input: Record<string, unknown>; output: unknown }

// ─── Message injection ────────────────────────────────────────────────────────
// Writes a MessageV2-format assistant message so the chatbot renders it
// with the correct tool-card or text layout.

async function injectMessage(sessionId: string, parts: InjectedPart[], directory: string): Promise<void> {
  const now = Date.now()
  const msgId = Identifier.ascending("message")

  await Session.updateMessage({
    id: msgId,
    sessionID: sessionId,
    role: "assistant",
    from: { kind: "service", id: "workflow" },
    time: { created: now, completed: now },
    modelID: "workflow-runner",
    providerID: "workflow",
    mode: "workflow",
    agent: "workflow",
    path: { cwd: directory, root: directory },
    cost: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const partId = Identifier.ascending("part")
    if (p.type === "text") {
      await Session.updatePart({
        id: partId,
        sessionID: sessionId,
        messageID: msgId,
        type: "text",
        text: p.text,
      })
    } else {
      const callId = Identifier.ascending("part")
      await Session.updatePart({
        id: partId,
        sessionID: sessionId,
        messageID: msgId,
        type: "tool",
        callID: callId,
        tool: p.tool,
        state: {
          status: "completed",
          input: p.input,
          output: typeof p.output === "string" ? p.output : JSON.stringify(p.output, null, 2),
          title: p.tool,
          metadata: {},
          time: { start: now, end: now },
        },
      })
    }
  }
}

// ─── Session prompt helper ────────────────────────────────────────────────────

async function agentPrompt(sessionId: string, text: string): Promise<string> {
  const result = await SessionPrompt.prompt({
    sessionID: sessionId,
    parts: [{ type: "text", text }],
  })
  // Extract text from the last assistant message parts
  const parts = (result as any).parts ?? []
  return parts
    .filter((p: any) => p.type === "text" && !p.synthetic)
    .map((p: any) => p.text ?? "")
    .join("")
    .trim()
}

// ─── Graph traversal ──────────────────────────────────────────────────────────

function buildAdjacency(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
  const map = new Map<string, WorkflowEdge[]>()
  for (const edge of edges) {
    if (!map.has(edge.source)) map.set(edge.source, [])
    map.get(edge.source)!.push(edge)
  }
  return map
}

function nextNode(adjacency: Map<string, WorkflowEdge[]>, nodeId: string, label?: string): string | undefined {
  const edges = adjacency.get(nodeId) ?? []
  if (edges.length === 0) return undefined
  if (label) {
    const match = edges.find((e) => e.label === label)
    return match?.target
  }
  return edges[0]?.target
}

// ─── Skill content loader ─────────────────────────────────────────────────────

async function loadSkillContent(directory: string, skillName: string): Promise<string | null> {
  const skillPath = path.join(directory, ".opendora", "skill", skillName, "SKILL.md")
  try {
    return await fs.readFile(skillPath, "utf8")
  } catch {
    return null
  }
}

// ─── Main runner ─────────────────────────────────────────────────────────────

export async function runWorkflow({
  workflow,
  sessionId,
  input,
  directory,
}: {
  workflow: Workflow
  sessionId: string
  input: Record<string, unknown>
  directory: string
}): Promise<void> {
  const adjacency = buildAdjacency(workflow.edges)
  const inputNode = workflow.nodes.find((n) => n.type === "input")
  if (!inputNode) throw new Error("Workflow has no input node")

  const ctx: Ctx = {}
  let currentId: string | undefined = inputNode.id

  while (currentId) {
    const node = workflow.nodes.find((n) => n.id === currentId)
    if (!node) break

    const data = node.data

    // ── input ──────────────────────────────────────────────────────────────────
    if (data.type === "input") {
      await injectMessage(sessionId, [
        {
          type: "tool",
          tool: "workflow_input",
          input: { workflow: workflow.name, ...input },
          output: { status: "received", fields: Object.keys(input) },
        },
      ], directory)
      currentId = nextNode(adjacency, currentId)

    // ── skill_load ─────────────────────────────────────────────────────────────
    } else if (data.type === "skill_load") {
      const content = await loadSkillContent(directory, data.skill)
      if (content) {
        const storeKey = data.storeAs ?? `skill_${data.skill}`
        ctx[storeKey] = content
        await injectMessage(sessionId, [
          {
            type: "tool",
            tool: "workflow_skill_load",
            input: { skill: data.skill },
            output: { loaded: true, characters: content.length },
          },
        ], directory)
      } else {
        await injectMessage(sessionId, [
          {
            type: "tool",
            tool: "workflow_skill_load",
            input: { skill: data.skill },
            output: { loaded: false, error: `Skill "${data.skill}" not found` },
          },
        ], directory)
      }
      currentId = nextNode(adjacency, currentId)

    // ── tool_call ──────────────────────────────────────────────────────────────
    } else if (data.type === "tool_call") {
      const resolvedArgs = resolveRefs(data.args, input, ctx)
      if (data.output) ctx[data.output] = resolvedArgs
      await injectMessage(sessionId, [
        {
          type: "tool",
          tool: data.tool,
          input: resolvedArgs,
          output: { queued: true, note: "Deterministic tool call — result available to next agent node" },
        },
      ], directory)
      currentId = nextNode(adjacency, currentId)

    // ── agent ──────────────────────────────────────────────────────────────────
    } else if (data.type === "agent") {
      const resolvedPrompt = resolveTemplate(data.prompt, input, ctx)

      // Build skill context block if any skills were loaded
      const skillContext = buildSkillContext(ctx)
      const fullPrompt = skillContext
        ? `${skillContext}\n\n---\n\n${resolvedPrompt}`
        : resolvedPrompt

      const response = await agentPrompt(sessionId, fullPrompt)
      if (data.output) ctx[data.output] = response
      currentId = nextNode(adjacency, currentId)

    // ── decide ─────────────────────────────────────────────────────────────────
    } else if (data.type === "decide") {
      const resolvedPrompt = resolveTemplate(data.prompt, input, ctx)
      const branchList = data.branches.join(", ")

      const decidePrompt = [
        resolvedPrompt,
        "",
        `Choose exactly one of the following branches: ${branchList}`,
        `Reply with only the branch name — no explanation.`,
      ].join("\n")

      const response = await agentPrompt(sessionId, decidePrompt)

      // Find which branch was chosen
      const chosen = data.branches.find((b) => response.toLowerCase().includes(b.toLowerCase()))
      const branch = chosen ?? data.branches[0]

      await injectMessage(sessionId, [
        {
          type: "tool",
          tool: "workflow_decide",
          input: { branches: data.branches },
          output: { chosen: branch },
        },
      ], directory)

      currentId = nextNode(adjacency, currentId, branch)

    // ── output ─────────────────────────────────────────────────────────────────
    } else if (data.type === "output") {
      const message = data.message
        ? resolveTemplate(data.message, input, ctx)
        : `Workflow "${workflow.name}" completed.`

      await injectMessage(sessionId, [
        { type: "text", text: message },
      ], directory)
      break

    } else {
      break
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSkillContext(ctx: Ctx): string {
  const entries = Object.entries(ctx).filter(([k]) => k.startsWith("skill_"))
  if (entries.length === 0) return ""
  return entries
    .map(([k, v]) => `<skill name="${k.replace("skill_", "")}">\n${v}\n</skill>`)
    .join("\n\n")
}
