import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import z from "zod"
import { Tool } from "../tool.ts"
import { directory } from "../host.ts"

/**
 * Walk up from `start` to find the nearest ancestor directory that contains
 * a `.projectflows` subdirectory. Falls back to `~/.projectflows/..` (home)
 * if none is found.
 */
async function findProjectFlowsRoot(start: string): Promise<string> {
  let current = start
  while (true) {
    try {
      await fs.access(path.join(current, ".projectflows"))
      return current
    } catch {
      // not found here, go up
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return os.homedir()
}

const KIND_LABEL: Record<string, string> = {
  error: "ERROR",
  bug: "BUG",
  failed: "FAILED",
  advisory: "ADVISORY",
}

/**
 * Resolve the path to LOG.md for a given target.
 *
 * agent:{id}   → {root}/.projectflows/agents/{id}/LOG.md
 * skill:{name} → {root}/.projectflows/skill/{name}/LOG.md
 */
function resolveLogPath(root: string, targetType: "agent" | "skill", targetId: string): string {
  if (targetType === "agent") {
    return path.join(root, ".projectflows", "agents", targetId, "LOG.md")
  }
  return path.join(root, ".projectflows", "skill", targetId, "LOG.md")
}

function formatEntry(kind: string, message: string, context?: string): string {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"
  const label = KIND_LABEL[kind] ?? kind.toUpperCase()
  const lines = [
    `### ${ts} [${label}]`,
    "",
    message.trim(),
  ]
  if (context?.trim()) {
    lines.push("", `_Context: ${context.trim()}_`)
  }
  lines.push("", "---", "")
  return lines.join("\n")
}

export const LogLessonTool = Tool.define(
  "log",
  async () => ({
    description:
      "Append an entry to the LOG.md file that lives next to a target agent or skill. " +
      "Creates LOG.md if it does not exist. " +
      "Use this for problems only — bugs, errors, failed attempts, and advisory improvements worth acting on. " +
      "Do NOT log successes, confirmations, or 'all good' outcomes — those are clutter. " +
      "Call it silently — it returns a compact one-line summary only.",

    parameters: z.object({
      target_type: z.enum(["agent", "skill"]).describe(
        "Whether the entry belongs to an agent or a skill"
      ),
      target_id: z.string().describe(
        "The agent ID (e.g. 'pandora', 'agent-owner') or skill name (e.g. 'experiment', 'retro')"
      ),
      kind: z.enum(["error", "bug", "failed", "advisory"]).describe(
        "error — unexpected runtime error; bug — wrong behaviour observed; failed — attempt that did not work; advisory — something that works but should be improved"
      ),
      message: z.string().describe(
        "What happened. Be specific: what was tried, what went wrong, what the impact was."
      ),
      context: z.string().optional().describe(
        "Optional: experiment ID, session ID, or step name that anchors this entry"
      ),
    }),

    async execute(args, ctx) {
      const root = await findProjectFlowsRoot(directory(ctx))
      const logPath = resolveLogPath(root, args.target_type, args.target_id)

      await fs.mkdir(path.dirname(logPath), { recursive: true })

      let existing = ""
      try {
        existing = await fs.readFile(logPath, "utf8")
      } catch {
        const kind = args.target_type === "agent" ? "Agent" : "Skill"
        existing = `# LOG — ${kind}: ${args.target_id}\n\n---\n\n`
      }

      const entry = formatEntry(args.kind, args.message, args.context)
      await fs.writeFile(logPath, existing + entry, "utf8")

      const preview = args.message.length > 80
        ? args.message.slice(0, 77) + "..."
        : args.message

      const label = KIND_LABEL[args.kind] ?? args.kind.toUpperCase()
      const relativePath = path.relative(root, logPath)

      return {
        title: "Logged",
        metadata: {
          targetType: args.target_type,
          targetId: args.target_id,
          kind: args.kind,
          logPath: relativePath,
        },
        output: `LOG updated — [${label}] → ${relativePath}\n${preview}`,
      }
    },
  })
)
