import z from "zod"
import * as fs from "fs/promises"
import * as path from "path"
import { Tool } from "../tool.ts"
import { directory } from "../host.ts"
import {
  parseEntries,
  serializeEntries,
  findOpendoraDir,
  resolveMemoryPath,
  readMemoryFile,
  type MemoryEntry,
} from "./lib.ts"
import toolDef from "./memory_write.json"

const parameters = z.object({
  name: z.string().describe("Unique snake_case key for this entry (e.g. user_prefers_terse_replies)"),
  description: z.string().describe("One-line description — used to decide relevance when scanning MEMORY.md"),
  type: z.enum(["user", "feedback", "project", "reference"]).describe(
    "user = facts about the user; feedback = working guidance; project = ongoing context; reference = external resource pointers",
  ),
  content: z.string().describe(
    "Full memory body. For feedback and project types: lead with the rule or fact, then **Why:** and **How to apply:** lines.",
  ),
  scope: z.enum(["global", "local"]).describe(
    "global = .projectflows/agents/MEMORY.md (all agents); local = .projectflows/agents/<this-agent>/MEMORY.md (this agent only)",
  ),
})

export const MemoryWriteTool = Tool.define("memory_write", {
  description: toolDef.description,
  parameters,
  async execute(params, ctx) {
    const opendoraDir = await findOpendoraDir(directory(ctx))
    const memoryPath = resolveMemoryPath(opendoraDir, params.scope, ctx.agent)

    const raw = await readMemoryFile(memoryPath)
    const entries = parseEntries(raw)

    const entry: MemoryEntry = {
      name: params.name,
      description: params.description,
      type: params.type,
      content: params.content,
    }

    const idx = entries.findIndex(e => e.name === params.name)
    const action = idx >= 0 ? "updated" : "saved"
    if (idx >= 0) {
      entries[idx] = entry
    } else {
      entries.push(entry)
    }

    await fs.mkdir(path.dirname(memoryPath), { recursive: true })
    await fs.writeFile(memoryPath, serializeEntries(entries), "utf-8")

    return {
      title: `Memory ${action}: ${params.name}`,
      metadata: { scope: params.scope, name: params.name, action, path: memoryPath },
      output: `Memory entry "${params.name}" ${action} in ${params.scope} MEMORY.md (${memoryPath}).`,
    }
  },
})
