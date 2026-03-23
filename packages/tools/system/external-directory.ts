import path from "path"
import type { Tool } from "../tool.ts"
import { host } from "../host.ts"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
}

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  if (!target) return

  if (options?.bypass) return

  const h = host(ctx)

  // If allowedPaths is configured, the path must be within one of them.
  // This is a hard policy boundary — throw rather than ask for permission.
  if (h.allowedPaths && h.allowedPaths.length > 0) {
    const isAllowed = h.allowedPaths.some(
      (allowed) => target === allowed || target.startsWith(allowed + path.sep),
    )
    if (!isAllowed) {
      throw new Error(
        `Path "${target}" is outside the allowed filesystem paths for this session.\n` +
          `Allowed paths: ${h.allowedPaths.join(", ")}`,
      )
    }
    return
  }

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
    metadata: {
      filepath: target,
      parentDir,
    },
  })
}
