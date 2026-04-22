import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import DESCRIPTION from "./clipboard-read.txt"

export const DesktopClipboardReadTool = Tool.define("desktop_clipboard_read", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
    parameters: z.object({}),
    async execute(_params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["clipboard"],
        always: [],
        metadata: { kind: "clipboard", summary: "Read clipboard" },
      })

      const { clipboard } = await getNut()
      const text = await clipboard.getContent()

      return {
        title: `Clipboard: ${text.length} characters`,
        metadata: { length: text.length },
        output: text,
      }
    },
  }
})
