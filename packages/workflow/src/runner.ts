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
import { pathToFileURL } from "url"
import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
import { MessageV2 } from "@opendora/session/message"
import { Identifier } from "@opendora/util/id"
import { Workflow, WorkflowEdge, WorkflowNode, resolveRefs, resolveTemplate } from "./schema.ts"

// ─── Skill functions — wired at startup by the host package ──────────────────
// Using a registry avoids a circular dependency (workflow ← core ← workflow).

type SkillInfo = { name: string; description?: string; content: string; location: string; tools?: string[] }

let _skillGet: ((name: string) => Promise<SkillInfo | null | undefined>) | null = null
let _addSkillTools: ((sessionId: string, tools: string[]) => void) | null = null
let _skillList: (() => Promise<SkillInfo[]>) | null = null

export function registerSkillFunctions(
  skillGet: (name: string) => Promise<SkillInfo | null | undefined>,
  addSkillTools: (sessionId: string, tools: string[]) => void,
  skillList?: () => Promise<SkillInfo[]>,
) {
  _skillGet = skillGet
  _addSkillTools = addSkillTools
  if (skillList) _skillList = skillList
}

// ─── Tool execution — wired at startup by the host package ───────────────────
// Injection keeps workflow package free of tool-registry imports (no circular dep).

export type WorkflowToolContext = {
  sessionID: string
  agent?: string
  model?: { providerID: string; modelID: string }
  abort?: AbortSignal
}

type ToolExecutor = (
  toolId: string,
  args: Record<string, unknown>,
  ctx: WorkflowToolContext,
) => Promise<string>

let _toolExecutor: ToolExecutor | null = null

export function registerToolExecutor(executor: ToolExecutor) {
  _toolExecutor = executor
}

type Ctx = Record<string, unknown>

type InjectedPart =
  | { type: "text"; text: string }
  | { type: "tool"; tool: string; input: Record<string, unknown>; output: unknown }

// ─── Message injection ────────────────────────────────────────────────────────

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
  // SessionPrompt.prompt() falls back to session.agentID when agent is not specified
  const session = await Session.get(sessionId)
  console.log(`[workflow] agentPrompt session=${sessionId} session.agentID=${session.agentID}`)
  const result = await SessionPrompt.prompt({
    sessionID: sessionId,
    parts: [{ type: "text", text }],
  })
  const parts = (result as any).parts ?? []
  return parts
    .filter((p: any) => p.type === "text" && !p.synthetic)
    .map((p: any) => p.text ?? "")
    .join("")
    .trim()
}

// ─── Node kind normalizer ─────────────────────────────────────────────────────

type NodeExec =
  | { kind: "input"; fields: Array<{ name: string; type: string; required: boolean; description?: string }> }
  | { kind: "skill_load"; skill: string; storeAs?: string }
  | { kind: "skill_list_all"; output?: string }
  | { kind: "tool_call"; tool: string; args: Record<string, string>; output?: string }
  | { kind: "agent"; prompt: string; output?: string }
  | { kind: "decide"; prompt: string; branches: string[] }
  | { kind: "output"; message?: string }
  | { kind: "unknown" }

function resolveNodeExec(node: WorkflowNode, allEdges: WorkflowEdge[]): NodeExec {
  const d = node.data as Record<string, unknown>

  // ── Legacy format ────────────────────────────────────────────────────────────
  if (d.type === "input") return { kind: "input", fields: (d.fields as any[]) ?? [] }
  if (d.type === "skill_load") return { kind: "skill_load", skill: d.skill as string, storeAs: d.storeAs as string | undefined }
  if (d.type === "tool_call") return { kind: "tool_call", tool: d.tool as string, args: (d.args as Record<string, string>) ?? {}, output: d.output as string | undefined }
  if (d.type === "agent") return { kind: "agent", prompt: d.prompt as string, output: d.output as string | undefined }
  if (d.type === "decide") return { kind: "decide", prompt: d.prompt as string, branches: d.branches as string[] }
  if (d.type === "output") return { kind: "output", message: d.message as string | undefined }

  // ── Unified / visual format (type: "workflow") ───────────────────────────────
  if ((node as any).type === "workflow") {
    const nodeType = d.nodeType as string | undefined
    const nd = (d.node ?? {}) as Record<string, unknown>
    const params = (nd.parameters ?? {}) as Record<string, unknown>
    const instructions = d.instructions as string | undefined

    if (nodeType === "start") {
      const inputData = d.data as Record<string, unknown> | undefined
      return { kind: "input", fields: (inputData?.inputs as any[]) ?? [] }
    }

    if (nodeType === "prompt") {
      const prompt = instructions ?? (nd.parameters != null ? String((nd as any).parameters?.prompt ?? "") : "")
      const output = (nd as any).parameters?.output != null ? String((nd as any).parameters.output) : undefined
      return { kind: "agent", prompt, output }
    }

    const actionId = nd.action_id as string | undefined

    if (actionId === "skill_load") {
      return {
        kind: "skill_load",
        skill: String(params.name ?? params.skill ?? ""),
        storeAs: params.storeAs != null ? String(params.storeAs) : undefined,
      }
    }
    if (actionId === "skill_list") {
      return {
        kind: "skill_list_all",
        output: params.output != null ? String(params.output) : undefined,
      }
    }
    if (actionId === "agent") {
      const prompt = instructions ?? (params.prompt != null ? String(params.prompt) : "")
      return { kind: "agent", prompt, output: params.output != null ? String(params.output) : undefined }
    }
    if (actionId === "decide") {
      const prompt = instructions ?? (params.prompt != null ? String(params.prompt) : "")
      const outEdges = allEdges.filter((e) => e.source === (node as any).id)
      const branches = outEdges.map((e) => e.label).filter(Boolean) as string[]
      return { kind: "decide", prompt, branches }
    }
    if (actionId === "output") {
      const message = instructions ?? (params.message != null ? String(params.message) : undefined)
      return { kind: "output", message: message || undefined }
    }
    if (actionId) {
      const args: Record<string, string> = {}
      for (const [k, v] of Object.entries(params)) {
        if (k !== "output") args[k] = String(v)
      }
      return {
        kind: "tool_call",
        tool: actionId,
        args,
        output: params.output != null ? String(params.output) : undefined,
      }
    }
  }

  return { kind: "unknown" }
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

// ─── Skill loader ─────────────────────────────────────────────────────────────

async function loadSkill(
  sessionId: string,
  skillName: string,
  directory: string,
): Promise<{ content: string; formattedOutput: string } | null> {
  if (_skillGet) {
    const skill = await _skillGet(skillName)
    if (!skill) return null

    if (skill.tools && skill.tools.length > 0 && _addSkillTools) {
      _addSkillTools(sessionId, skill.tools)
    }

    const dir = path.dirname(skill.location)
    const base = pathToFileURL(dir).href

    const formattedOutput = [
      `<skill_content name="${skill.name}">`,
      `# Skill: ${skill.name}`,
      "",
      skill.content.trim(),
      "",
      `Base directory for this skill: ${base}`,
      `Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.`,
      "</skill_content>",
    ].join("\n")

    return { content: skill.content, formattedOutput }
  }

  // Fallback: read SKILL.md directly from the workflow's directory
  const skillPath = path.join(directory, ".opendora", "skill", skillName, "SKILL.md")
  try {
    const content = await fs.readFile(skillPath, "utf8")
    const formattedOutput = [
      `<skill_content name="${skillName}">`,
      content.trim(),
      `</skill_content>`,
    ].join("\n")
    return { content, formattedOutput }
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

  const findStartNode = (): WorkflowNode | undefined => {
    const legacyStart = workflow.nodes.find((n) => n.type === "input")
    if (legacyStart) return legacyStart
    const unifiedStart = workflow.nodes.find(
      (n) => (n as any).type === "workflow" && (n.data as any).nodeType === "start"
    )
    if (unifiedStart) return unifiedStart
    const targetIds = new Set(workflow.edges.map((e) => e.target))
    return workflow.nodes.find((n) => !targetIds.has((n as any).id))
  }

  const startNode = findStartNode()
  if (!startNode) throw new Error("Workflow has no start node and no root node can be determined")

  const ctx: Ctx = {}
  let currentId: string | undefined = (startNode as any).id

  while (currentId) {
    const node = workflow.nodes.find((n) => (n as any).id === currentId)
    if (!node) break

    const exec = resolveNodeExec(node, workflow.edges)

    if (exec.kind === "input") {
      await injectMessage(sessionId, [
        {
          type: "tool",
          tool: "workflow_input",
          input: { workflow: workflow.name, ...input },
          output: { status: "received", fields: Object.keys(input) },
        },
      ], directory)
      currentId = nextNode(adjacency, currentId)

    } else if (exec.kind === "skill_load") {
      const storeKey = exec.storeAs ?? `skill_${exec.skill}`
      const loaded = await loadSkill(sessionId, exec.skill, directory)
      if (loaded) {
        ctx[storeKey] = loaded.content
        await injectMessage(sessionId, [
          { type: "tool", tool: "skill_load", input: { name: exec.skill }, output: loaded.formattedOutput },
        ], directory)
      } else {
        await injectMessage(sessionId, [
          { type: "tool", tool: "skill_load", input: { name: exec.skill }, output: `Skill "${exec.skill}" not found` },
        ], directory)
      }
      currentId = nextNode(adjacency, currentId)

    } else if (exec.kind === "skill_list_all") {
      const skills = _skillList ? await _skillList() : []
      const formatted = [
        "<skills>",
        ...skills.flatMap((skill) => [
          `  <skill>`,
          `    <name>${skill.name}</name>`,
          ...(skill.description ? [`    <description>${skill.description}</description>`] : []),
          `  </skill>`,
        ]),
        "</skills>",
        "",
        `Total: ${skills.length} skill(s)`,
      ].join("\n")
      if (exec.output) ctx[exec.output] = formatted
      await injectMessage(sessionId, [
        { type: "tool", tool: "skill_list", input: {}, output: formatted },
      ], directory)
      currentId = nextNode(adjacency, currentId)

    } else if (exec.kind === "tool_call") {
      const resolvedArgs = resolveRefs(exec.args, input, ctx)
      if (exec.output) ctx[exec.output] = resolvedArgs
      await injectMessage(sessionId, [
        {
          type: "tool",
          tool: exec.tool,
          input: resolvedArgs,
          output: { queued: true, note: "Deterministic tool call — result available to next agent node" },
        },
      ], directory)
      currentId = nextNode(adjacency, currentId)

    } else if (exec.kind === "agent") {
      const resolvedPrompt = resolveTemplate(exec.prompt, input, ctx)
      const response = await agentPrompt(sessionId, resolvedPrompt)
      if (exec.output) ctx[exec.output] = response
      currentId = nextNode(adjacency, currentId)

    } else if (exec.kind === "decide") {
      const resolvedPrompt = resolveTemplate(exec.prompt, input, ctx)
      const branchList = exec.branches.join(", ")

      const decidePrompt = [
        resolvedPrompt,
        "",
        `Choose exactly one of the following branches: ${branchList}`,
        `Reply with only the branch name — no explanation.`,
      ].join("\n")

      const response = await agentPrompt(sessionId, decidePrompt)
      const chosen = exec.branches.find((b) => response.toLowerCase().includes(b.toLowerCase()))
      const branch = chosen ?? exec.branches[0]

      await injectMessage(sessionId, [
        { type: "tool", tool: "workflow_decide", input: { branches: exec.branches }, output: { chosen: branch } },
      ], directory)

      currentId = nextNode(adjacency, currentId, branch)

    } else if (exec.kind === "output") {
      const message = exec.message
        ? resolveTemplate(exec.message, input, ctx)
        : `Workflow "${workflow.name}" completed.`

      await injectMessage(sessionId, [{ type: "text", text: message }], directory)
      break

    } else {
      currentId = nextNode(adjacency, currentId)
    }
  }
}

