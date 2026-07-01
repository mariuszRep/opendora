import z from "zod"
import * as fs from "fs/promises"
import { Tool } from "../tool.ts"
import { directory } from "../host.ts"
import { Instance } from "@projectflows/runtime/instance"
import {
  findProjectFlowsDirCandidates,
  resolveMemoryPath,
  readMemoryFile,
  writeMemoryFile,
} from "./lib.ts"

const parameters = z.object({
  name: z.string().describe("Name of the memory entry to delete"),
  scope: z.enum(["global", "local"]).describe(
    "global = .projectflows/agents/MEMORY.json (all agents); local = .projectflows/agents/<this-agent>/MEMORY.json (this agent only)",
  ),
})

export const MemoryDeleteTool = Tool.define("memory_delete", {
  description: "Delete a memory entry by name from MEMORY.json. Use to remove stale, incorrect, or superseded memories.",
  parameters,
  async execute(params, ctx) {
    const toolDir = (() => { try { return directory(ctx) } catch { return undefined } })()
    const instanceDir = (() => { try { return Instance.directory } catch { return undefined } })()
    const projectflowsDir = await findProjectFlowsDirCandidates([toolDir, instanceDir])
    const memoryPath = resolveMemoryPath(projectflowsDir, params.scope, ctx.agent)

    const entries = await readMemoryFile(memoryPath)
    const idx = entries.findIndex(e => e.name === params.name)

    if (idx < 0) {
      return {
        title: `Memory not found: ${params.name}`,
        metadata: { scope: params.scope, name: params.name, deleted: false, path: memoryPath },
        output: `No memory entry named "${params.name}" found in ${params.scope} MEMORY.json.`,
      }
    }

    entries.splice(idx, 1)

    if (entries.length === 0) {
      await fs.unlink(memoryPath).catch(() => {})
    } else {
      await writeMemoryFile(memoryPath, entries)
    }

    return {
      title: `Memory deleted: ${params.name}`,
      metadata: { scope: params.scope, name: params.name, deleted: true, path: memoryPath },
      output: `Memory entry "${params.name}" deleted from ${params.scope} MEMORY.json (${memoryPath}).`,
    }
  },
})
