import z from "zod"
import * as path from "path"
import * as fs from "fs/promises"
import { Tool } from "../tool.ts"
import { host, directory, worktree } from "../host.ts"
import { Patch } from "../lib/patch.ts"
import { createTwoFilesPatch, diffLines } from "diff"
import { assertExternalDirectory } from "../system/external-directory.ts"
import { trimDiff } from "./edit.ts"
import { Filesystem } from "../lib/filesystem.ts"
import DESCRIPTION from "./apply_patch.txt"

const PatchParams = z.object({
  patchText: z.string().describe("The full patch text that describes all changes to be made"),
})

export const ApplyPatchTool = Tool.define("apply_patch", {
  description: DESCRIPTION,
  parameters: PatchParams,
  async execute(params, ctx) {
    if (!params.patchText) {
      throw new Error("patchText is required")
    }

    const dir = directory(ctx)
    const wt = worktree(ctx)
    const h = host(ctx)

    // Parse the patch to get hunks
    let hunks: Patch.Hunk[]
    try {
      const parseResult = Patch.parsePatch(params.patchText)
      hunks = parseResult.hunks
    } catch (error) {
      throw new Error(`apply_patch verification failed: ${error}`)
    }

    if (hunks.length === 0) {
      const normalized = params.patchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
      if (normalized === "*** Begin Patch\n*** End Patch") {
        throw new Error("patch rejected: empty patch")
      }
      throw new Error("apply_patch verification failed: no hunks found")
    }

    // Validate file paths and check permissions
    const fileChanges: Array<{
      filePath: string
      oldContent: string
      newContent: string
      type: "add" | "update" | "delete" | "move"
      movePath?: string
      diff: string
      additions: number
      deletions: number
    }> = []

    let totalDiff = ""

    for (const hunk of hunks) {
      const filePath = path.resolve(dir, hunk.path)
      await assertExternalDirectory(ctx, filePath)

      switch (hunk.type) {
        case "add": {
          const oldContent = ""
          const newContent =
            hunk.contents.length === 0 || hunk.contents.endsWith("\n") ? hunk.contents : `${hunk.contents}\n`
          const diff = trimDiff(createTwoFilesPatch(filePath, filePath, oldContent, newContent))

          let additions = 0
          let deletions = 0
          for (const change of diffLines(oldContent, newContent)) {
            if (change.added) additions += change.count || 0
            if (change.removed) deletions += change.count || 0
          }

          fileChanges.push({
            filePath,
            oldContent,
            newContent,
            type: "add",
            diff,
            additions,
            deletions,
          })

          totalDiff += diff + "\n"
          break
        }

        case "update": {
          const stats = await fs.stat(filePath).catch(() => null)
          if (!stats || stats.isDirectory()) {
            throw new Error(`apply_patch verification failed: Failed to read file to update: ${filePath}`)
          }

          const oldContent = await fs.readFile(filePath, "utf-8")
          let newContent = oldContent

          try {
            const fileUpdate = Patch.deriveNewContentsFromChunks(filePath, hunk.chunks)
            newContent = fileUpdate.content
          } catch (error) {
            throw new Error(`apply_patch verification failed: ${error}`)
          }

          const diff = trimDiff(createTwoFilesPatch(filePath, filePath, oldContent, newContent))

          let additions = 0
          let deletions = 0
          for (const change of diffLines(oldContent, newContent)) {
            if (change.added) additions += change.count || 0
            if (change.removed) deletions += change.count || 0
          }

          const movePath = hunk.move_path ? path.resolve(dir, hunk.move_path) : undefined
          await assertExternalDirectory(ctx, movePath)

          fileChanges.push({
            filePath,
            oldContent,
            newContent,
            type: hunk.move_path ? "move" : "update",
            movePath,
            diff,
            additions,
            deletions,
          })

          totalDiff += diff + "\n"
          break
        }

        case "delete": {
          const contentToDelete = await fs.readFile(filePath, "utf-8").catch((error) => {
            throw new Error(`apply_patch verification failed: ${error}`)
          })
          const deleteDiff = trimDiff(createTwoFilesPatch(filePath, filePath, contentToDelete, ""))

          const deletions = contentToDelete.split("\n").length

          fileChanges.push({
            filePath,
            oldContent: contentToDelete,
            newContent: "",
            type: "delete",
            diff: deleteDiff,
            additions: 0,
            deletions,
          })

          totalDiff += deleteDiff + "\n"
          break
        }
      }
    }

    // Build per-file metadata
    const files = fileChanges.map((change) => ({
      filePath: change.filePath,
      relativePath: path.relative(wt, change.movePath ?? change.filePath).replaceAll("\\", "/"),
      type: change.type,
      diff: change.diff,
      before: change.oldContent,
      after: change.newContent,
      additions: change.additions,
      deletions: change.deletions,
      movePath: change.movePath,
    }))

    const relativePaths = fileChanges.map((c) => path.relative(wt, c.filePath).replaceAll("\\", "/"))
    await ctx.ask({
      permission: "edit",
      patterns: relativePaths,
      always: ["*"],
      metadata: {
        filepath: relativePaths.join(", "),
        diff: totalDiff,
        files,
      },
    })

    // Apply the changes
    const updates: Array<{ file: string; event: "add" | "change" | "unlink" }> = []

    for (const change of fileChanges) {
      switch (change.type) {
        case "add":
          await fs.mkdir(path.dirname(change.filePath), { recursive: true })
          await fs.writeFile(change.filePath, change.newContent, "utf-8")
          updates.push({ file: change.filePath, event: "add" })
          break

        case "update":
          await fs.writeFile(change.filePath, change.newContent, "utf-8")
          updates.push({ file: change.filePath, event: "change" })
          break

        case "move":
          if (change.movePath) {
            await fs.mkdir(path.dirname(change.movePath), { recursive: true })
            await fs.writeFile(change.movePath, change.newContent, "utf-8")
            await fs.unlink(change.filePath)
            updates.push({ file: change.filePath, event: "unlink" })
            updates.push({ file: change.movePath, event: "add" })
          }
          break

        case "delete":
          await fs.unlink(change.filePath)
          updates.push({ file: change.filePath, event: "unlink" })
          break
      }

      const edited = change.type === "delete" ? undefined : (change.movePath ?? change.filePath)
      if (edited) {
        h.emit?.("file.changed", { file: edited })
      }
    }

    // Publish file change events
    for (const update of updates) {
      h.emit?.("file.updated", update)
    }

    // Notify LSP of file changes and collect diagnostics
    for (const change of fileChanges) {
      if (change.type === "delete") continue
      const target = change.movePath ?? change.filePath
      await h.lsp?.touchFile(target)
    }
    const diagnosticsAll = h.lsp?.diagnosticsAll ? await h.lsp.diagnosticsAll() : {}

    // Generate output summary
    const summaryLines = fileChanges.map((change) => {
      if (change.type === "add") {
        return `A ${path.relative(wt, change.filePath).replaceAll("\\", "/")}`
      }
      if (change.type === "delete") {
        return `D ${path.relative(wt, change.filePath).replaceAll("\\", "/")}`
      }
      const target = change.movePath ?? change.filePath
      return `M ${path.relative(wt, target).replaceAll("\\", "/")}`
    })
    let output = `Success. Updated the following files:\n${summaryLines.join("\n")}`

    const MAX_DIAGNOSTICS_PER_FILE = 20
    for (const change of fileChanges) {
      if (change.type === "delete") continue
      const target = change.movePath ?? change.filePath
      const normalized = Filesystem.normalizePath(target)
      const issues = (diagnosticsAll[normalized] ?? []) as any[]
      const errors = issues.filter((item) => item.severity === 1)
      if (errors.length > 0) {
        const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
        const suffix =
          errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
        const prettyDiag = limited.map((d: any) => `${d.message} (${d.source ?? "lsp"}) at line ${d.range?.start?.line ?? "?"}`).join("\n")
        output += `\n\nLSP errors detected in ${path.relative(wt, target).replaceAll("\\", "/")}, please fix:\n<diagnostics file="${target}">\n${prettyDiag}${suffix}\n</diagnostics>`
      }
    }

    return {
      title: output,
      metadata: {
        diff: totalDiff,
        files,
        diagnostics: diagnosticsAll,
      },
      output,
    }
  },
})
