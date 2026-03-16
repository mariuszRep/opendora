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
