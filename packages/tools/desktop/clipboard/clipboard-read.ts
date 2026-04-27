import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { nativeClipboardPreferred, readText as nativeRead } from "../lib/clipboard-native.ts"
import toolDef from ".//clipboard-read.json"

export const DesktopClipboardReadTool = Tool.define("desktop_clipboard_read", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
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

      let text: string
      if (nativeClipboardPreferred()) {
        text = await nativeRead()
      } else {
        const { clipboard } = await getNut()
        text = await clipboard.getContent()
      }

      return {
        title: `Clipboard: ${text.length} characters`,
        metadata: { length: text.length },
        output: text,
      }
    },
  }
})
