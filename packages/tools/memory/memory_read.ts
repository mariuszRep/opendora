import z from "zod"
import { Tool } from "../tool.ts"
import { directory } from "../host.ts"
import { Instance } from "@opendora/runtime/instance"
import {
  entriesToMarkdown,
  findProjectFlowsDirCandidates,
  resolveMemoryPath,
  readMemoryFile,
} from "./lib.ts"
import toolDef from "./memory_read.json"

const parameters = z.object({
  scope: z.enum(["global", "local", "both"]).optional().default("both").describe(
    "Which MEMORY.json to read. global = shared, local = this agent only, both = merge (default)",
  ),
  name: z.string().optional().describe("Read a specific entry by name. Omit to read all entries."),
})

export const MemoryReadTool = Tool.define("memory_read", {
  description: toolDef.description,
  parameters,
  async execute(params, ctx) {
    const toolDir = (() => { try { return directory(ctx) } catch { return undefined } })()
    const instanceDir = (() => { try { return Instance.directory } catch { return undefined } })()
    const opendoraDir = await findProjectFlowsDirCandidates([toolDir, instanceDir])
    const scope = params.scope ?? "both"

    const targets: Array<{ label: string; file: string }> = []
    if (scope === "global" || scope === "both") {
      targets.push({ label: "global", file: resolveMemoryPath(opendoraDir, "global", ctx.agent) })
    }
    if (scope === "local" || scope === "both") {
      targets.push({ label: "local", file: resolveMemoryPath(opendoraDir, "local", ctx.agent) })
    }

    const sections: string[] = []
    let totalEntries = 0

    for (const { label, file } of targets) {
      let entries = await readMemoryFile(file)
      if (params.name) entries = entries.filter(e => e.name === params.name)
      if (entries.length === 0) continue

      totalEntries += entries.length
      sections.push(`## ${label} memory\n\n${entriesToMarkdown(entries)}`)
    }

    if (sections.length === 0) {
      return {
        title: "Memory: empty",
        metadata: { scope, name: params.name, found: 0 },
        output: params.name
          ? `No memory entry named "${params.name}" found.`
          : "No memory entries found.",
      }
    }

    return {
      title: `Memory: ${totalEntries} entr${totalEntries === 1 ? "y" : "ies"}`,
      metadata: { scope, name: params.name, found: totalEntries },
      output: sections.join("\n\n"),
    }
  },
})
