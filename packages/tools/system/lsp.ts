import z from "zod"
import { Tool } from "../tool.ts"
import path from "path"
import { host, directory, worktree } from "../host.ts"
import DESCRIPTION from "./lsp.txt"
import { pathToFileURL } from "url"
import { assertExternalDirectory } from "./external-directory.ts"
import { Filesystem } from "../filesystem/lib/primitives.ts"

const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
] as const

export const LspTool = Tool.define("lsp", {
  description: DESCRIPTION,
  parameters: z.object({
    operation: z.enum(operations).describe("The LSP operation to perform"),
    filePath: z.string().describe("The absolute or relative path to the file"),
    line: z.number().int().min(1).describe("The line number (1-based, as shown in editors)"),
    character: z.number().int().min(1).describe("The character offset (1-based, as shown in editors)"),
  }),
  execute: async (args, ctx) => {
    const dir = directory(ctx)
    const wt = worktree(ctx)
    const lsp = host(ctx).lsp

    const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(dir, args.filePath)
    await assertExternalDirectory(ctx, file)

    await ctx.ask({
      permission: "lsp",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })
    const uri = pathToFileURL(file).href
    const position = {
      file,
      line: args.line - 1,
      character: args.character - 1,
    }

    const relPath = path.relative(wt, file)
    const title = `${args.operation} ${relPath}:${args.line}:${args.character}`

    const exists = await Filesystem.exists(file)
    if (!exists) {
      throw new Error(`File not found: ${file}`)
    }

    if (!lsp) {
      throw new Error("No LSP server available for this file type.")
    }

    const available = lsp.hasClients ? await lsp.hasClients(file) : true
    if (!available) {
      throw new Error("No LSP server available for this file type.")
    }

    await lsp.touchFile(file)

    const result: unknown[] = await (async () => {
      switch (args.operation) {
        case "goToDefinition":
          return lsp.definition ? lsp.definition(position) : []
        case "findReferences":
          return lsp.references ? lsp.references(position) : []
        case "hover":
          return lsp.hover ? lsp.hover(position) : []
        case "documentSymbol":
          return lsp.documentSymbol ? lsp.documentSymbol(uri) : []
        case "workspaceSymbol":
          return lsp.workspaceSymbol ? lsp.workspaceSymbol("") : []
        case "goToImplementation":
          return lsp.implementation ? lsp.implementation(position) : []
        case "prepareCallHierarchy":
          return lsp.prepareCallHierarchy ? lsp.prepareCallHierarchy(position) : []
        case "incomingCalls":
          return lsp.incomingCalls ? lsp.incomingCalls(position) : []
        case "outgoingCalls":
          return lsp.outgoingCalls ? lsp.outgoingCalls(position) : []
      }
    })()

    const output = (() => {
      if (result.length === 0) return `No results found for ${args.operation}`
      return JSON.stringify(result, null, 2)
    })()

    return {
      title,
      metadata: { result },
      output,
    }
  },
})
