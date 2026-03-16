import z from "zod"
import * as path from "path"
import { Tool } from "../tool.ts"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { FileTime } from "../lib/file-time.ts"
import { Filesystem } from "../lib/filesystem.ts"
import { host, directory, worktree } from "../host.ts"
import { trimDiff } from "./edit.ts"
import { assertExternalDirectory } from "../system/external-directory.ts"

const MAX_DIAGNOSTICS_PER_FILE = 20
const MAX_PROJECT_DIAGNOSTICS_FILES = 5

export const WriteTool = Tool.define("write", {
  description: DESCRIPTION,
  parameters: z.object({
    content: z.string().describe("The content to write to the file"),
    filePath: z.string().describe("The absolute path to the file to write (must be absolute, not relative)"),
  }),
  async execute(params, ctx) {
    const dir = directory(ctx)
    const wt = worktree(ctx)
    const h = host(ctx)

    const filepath = path.isAbsolute(params.filePath) ? params.filePath : path.join(dir, params.filePath)
    await assertExternalDirectory(ctx, filepath)

    const exists = await Filesystem.exists(filepath)
    const contentOld = exists ? await Filesystem.readText(filepath) : ""
    if (exists) await FileTime.assert(ctx.sessionID, filepath, h.disableFiletimeCheck)

    const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, params.content))
    await ctx.ask({
      permission: "edit",
      patterns: [path.relative(wt, filepath)],
      always: ["*"],
      metadata: {
        filepath,
        diff,
      },
    })

    await Filesystem.write(filepath, params.content)
    h.emit?.("file.changed", { file: filepath, event: exists ? "change" : "add" })
    FileTime.recordRead(ctx.sessionID, filepath)

    let output = "Wrote file successfully."
    await h.lsp?.touchFile(filepath)
    const diagnosticsAll = h.lsp?.diagnosticsAll ? await h.lsp.diagnosticsAll() : {}
    const normalizedFilepath = Filesystem.normalizePath(filepath)
    let projectDiagnosticsCount = 0
    for (const [file, issues] of Object.entries(diagnosticsAll)) {
      const errors = (issues as any[]).filter((item) => item.severity === 1)
      if (errors.length === 0) continue
      const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
      const suffix =
        errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
      const prettyDiag = limited.map((d: any) => `${d.message} (${d.source ?? "lsp"}) at line ${d.range?.start?.line ?? "?"}`).join("\n")
      if (file === normalizedFilepath) {
        output += `\n\nLSP errors detected in this file, please fix:\n<diagnostics file="${filepath}">\n${prettyDiag}${suffix}\n</diagnostics>`
        continue
      }
      if (projectDiagnosticsCount >= MAX_PROJECT_DIAGNOSTICS_FILES) continue
      projectDiagnosticsCount++
      output += `\n\nLSP errors detected in other files:\n<diagnostics file="${file}">\n${prettyDiag}${suffix}\n</diagnostics>`
    }

    return {
      title: path.relative(wt, filepath),
      metadata: {
        diagnostics: diagnosticsAll,
        filepath,
        exists: exists,
      },
      output,
    }
  },
})
