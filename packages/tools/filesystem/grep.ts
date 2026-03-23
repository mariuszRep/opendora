import z from "zod"
import { text } from "node:stream/consumers"
import { Tool } from "../tool.ts"
import { Filesystem } from "./lib/primitives.ts"
import { Process } from "../lib/process.ts"

import DESCRIPTION from "./grep.txt"
import { host, directory, worktree } from "../host.ts"
import path from "path"
import { assertExternalDirectory } from "../system/external-directory.ts"

const MAX_LINE_LENGTH = 2000

export const GrepTool = Tool.define("grep", {
  description: DESCRIPTION,
  parameters: z.object({
    pattern: z.string().describe("The regex pattern to search for in file contents"),
    path: z.string().optional().describe("The directory to search in. Defaults to the current working directory."),
    include: z.string().optional().describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'),
  }),
  async execute(params, ctx) {
    if (!params.pattern) {
      throw new Error("pattern is required")
    }

    await ctx.ask({
      permission: "grep",
      patterns: [params.pattern],
      always: ["*"],
      metadata: {
        pattern: params.pattern,
        path: params.path,
        include: params.include,
      },
    })

    const dir = directory(ctx)
    const h = host(ctx)

    let searchPath = params.path ?? dir
    searchPath = path.isAbsolute(searchPath) ? searchPath : path.resolve(dir, searchPath)
    await assertExternalDirectory(ctx, searchPath, { kind: "directory" })

    let output = ""
    let exitCode = 0
    let errorOutput = ""

    if (h.ripgrep) {
      // Use host ripgrep
      const args = ["-nH", "--hidden", "--no-messages", "--field-match-separator=|", "--regexp", params.pattern]
      if (params.include) {
        args.push("--glob", params.include)
      }
      args.push(searchPath)
      try {
        const results = await h.ripgrep.search(args, { cwd: searchPath })
        // results should be lines of output when using raw args
        output = results.map((r: any) => {
          if (typeof r === "string") return r
          if (r.type === "match" && r.data) {
            const d = r.data as any
            return `${d.path?.text ?? ""}|${d.line_number ?? ""}|${d.lines?.text?.trimEnd() ?? ""}`
          }
          return ""
        }).filter(Boolean).join("\n")
      } catch (e) {
        exitCode = 1
      }
    } else {
      // Fallback: try to find ripgrep in PATH and spawn it directly
      const { spawn } = await import("child_process")
      const rg = process.platform === "win32" ? "rg.exe" : "rg"
      const args = ["-nH", "--hidden", "--no-messages", "--field-match-separator=|", "--regexp", params.pattern]
      if (params.include) {
        args.push("--glob", params.include)
      }
      args.push(searchPath)

      const proc = Process.spawn([rg, ...args], {
        stdout: "pipe",
        stderr: "pipe",
        abort: ctx.abort,
      })

      if (!proc.stdout || !proc.stderr) {
        throw new Error("Process output not available")
      }

      output = await text(proc.stdout)
      errorOutput = await text(proc.stderr)
      exitCode = await proc.exited
    }

    if (exitCode === 1 || (exitCode === 2 && !output.trim())) {
      return {
        title: params.pattern,
        metadata: { matches: 0, truncated: false },
        output: "No files found",
      }
    }

    if (exitCode !== 0 && exitCode !== 2) {
      throw new Error(`ripgrep failed: ${errorOutput}`)
    }

    const hasErrors = exitCode === 2

    const lines = output.trim().split(/\r?\n/)
    const matches = []

    for (const line of lines) {
      if (!line) continue

      const [filePath, lineNumStr, ...lineTextParts] = line.split("|")
      if (!filePath || !lineNumStr || lineTextParts.length === 0) continue

      const lineNum = parseInt(lineNumStr, 10)
      const lineText = lineTextParts.join("|")

      const stats = Filesystem.stat(filePath)
      if (!stats) continue

      matches.push({
        path: filePath,
        modTime: stats.mtime.getTime(),
        lineNum,
        lineText,
      })
    }

    matches.sort((a, b) => b.modTime - a.modTime)

    const limit = 100
    const truncated = matches.length > limit
    const finalMatches = truncated ? matches.slice(0, limit) : matches

    if (finalMatches.length === 0) {
      return {
        title: params.pattern,
        metadata: { matches: 0, truncated: false },
        output: "No files found",
      }
    }

    const totalMatches = matches.length
    const outputLines = [`Found ${totalMatches} matches${truncated ? ` (showing first ${limit})` : ""}`]

    let currentFile = ""
    for (const match of finalMatches) {
      if (currentFile !== match.path) {
        if (currentFile !== "") {
          outputLines.push("")
        }
        currentFile = match.path
        outputLines.push(`${match.path}:`)
      }
      const truncatedLineText =
        match.lineText.length > MAX_LINE_LENGTH ? match.lineText.substring(0, MAX_LINE_LENGTH) + "..." : match.lineText
      outputLines.push(`  Line ${match.lineNum}: ${truncatedLineText}`)
    }

    if (truncated) {
      outputLines.push("")
      outputLines.push(
        `(Results truncated: showing ${limit} of ${totalMatches} matches (${totalMatches - limit} hidden). Consider using a more specific path or pattern.)`,
      )
    }

    if (hasErrors) {
      outputLines.push("")
      outputLines.push("(Some paths were inaccessible and skipped)")
    }

    return {
      title: params.pattern,
      metadata: {
        matches: totalMatches,
        truncated,
      },
      output: outputLines.join("\n"),
    }
  },
})
