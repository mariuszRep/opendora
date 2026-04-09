import path from "path"
import type { Tool } from "../tool.ts"
import { host } from "../host.ts"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
  write?: boolean
}

function isWithin(target: string, boundary: string): boolean {
  return target === boundary || target.startsWith(boundary + path.sep)
}

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  if (!target) return
  if (options?.bypass) return

  const h = host(ctx)
  const isWrite = options?.write ?? false

  // Hard write boundary: session.path — throw, no approval possible.
  if (isWrite && h.allowedPaths && h.allowedPaths.length > 0) {
    const allowed = h.allowedPaths.some((p) => isWithin(target, p))
    if (!allowed) {
      throw new Error(
        `Write to "${target}" is blocked — outside the session's write boundary.\n` +
          `Write boundary: ${h.allowedPaths.join(", ")}`,
      )
    }
    return
  }

  // Soft read boundary: session.readPath — ask user for approval if outside.
  const readBoundary = h.readPath ?? h.allowedPaths?.[0]
  if (readBoundary) {
    if (isWithin(target, readBoundary)) return
    const kind = options?.kind ?? "file"
    const parentDir = kind === "directory" ? target : path.dirname(target)
    const glob = path.join(parentDir, "*").replaceAll("\\", "/")
    await ctx.ask({
      permission: "external_directory",
      patterns: [glob],
      always: [glob],
      metadata: { filepath: target, parentDir },
    })
    return
  }

  // No session boundaries configured — fall back to worktree containment check.
  const containsPath = h.containsPath ?? ((p: string) => {
    if (!h.worktree) return true
    return !path.relative(h.worktree, p).startsWith("..")
  })

  if (containsPath(target)) return

  const kind = options?.kind ?? "file"
  const parentDir = kind === "directory" ? target : path.dirname(target)
  const glob = path.join(parentDir, "*").replaceAll("\\", "/")

  await ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    always: [glob],
    metadata: { filepath: target, parentDir },
  })
}
