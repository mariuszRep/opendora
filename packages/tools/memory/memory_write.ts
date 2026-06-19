import z from "zod"
import { Tool } from "../tool.ts"
import { directory, host } from "../host.ts"
import { Instance } from "@opendora/runtime/instance"
import {
  findProjectFlowsDirCandidates,
  resolveMemoryPath,
  readMemoryFile,
  writeMemoryFile,
  type MemoryEntry,
} from "./lib.ts"
import toolDef from "./memory_write.json"

const parameters = z.object({
  name: z.string().describe("Unique snake_case key for this entry (e.g. user_prefers_terse_replies)"),
  description: z.string().describe("One-line description — used to decide relevance when scanning MEMORY.json"),
  type: z.enum(["user", "feedback", "project", "reference"]).describe(
    "user = facts about the user; feedback = working guidance; project = ongoing context; reference = external resource pointers",
  ),
  content: z.string().describe(
    "Full memory body. For feedback and project types: lead with the rule or fact, then **Why:** and **How to apply:** lines.",
  ),
  scope: z.enum(["global", "local"]).describe(
    "global = .projectflows/agents/MEMORY.json (all agents); local = .projectflows/agents/<this-agent>/MEMORY.json (this agent only)",
  ),
})

export const MemoryWriteTool = Tool.define("memory_write", {
  description: toolDef.description,
  parameters,
  async execute(params, ctx) {
    const toolDir = (() => { try { return directory(ctx) } catch { return undefined } })()
    const instanceDir = (() => { try { return Instance.directory } catch { return undefined } })()
    const opendoraDir = await findProjectFlowsDirCandidates([toolDir, instanceDir])
    const memoryPath = resolveMemoryPath(opendoraDir, params.scope, ctx.agent)

    const entries = await readMemoryFile(memoryPath)

    const now = Date.now()
    const idx = entries.findIndex(e => e.name === params.name)
    const action = idx >= 0 ? "updated" : "saved"
    const entry: MemoryEntry = {
      name: params.name,
      description: params.description,
      type: params.type,
      content: params.content,
      createdAt: idx >= 0 ? (entries[idx]!.createdAt ?? now) : now,
      updatedAt: now,
    }

    if (idx >= 0) {
      entries[idx] = entry
    } else {
      entries.push(entry)
    }

    await writeMemoryFile(memoryPath, entries)

    host(ctx).emit?.("memory.write", {
      sessionID: ctx.sessionID,
      agentID: ctx.agent,
      callID: ctx.callID,
      directory: opendoraDir,
      name: params.name,
      description: params.description,
      scope: params.scope,
      action,
    })

    return {
      title: `Memory ${action}: ${params.name}`,
      metadata: { scope: params.scope, name: params.name, action, path: memoryPath, agentID: ctx.agent, directory: opendoraDir },
      output: `Memory entry "${params.name}" ${action} in ${params.scope} MEMORY.json (${memoryPath}).`,
    }
  },
})
