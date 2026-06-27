import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { nativeClipboardPreferred, writeText as nativeWrite } from "../lib/clipboard-native.ts"
import toolDef from ".//clipboard-write.json"

export const DesktopClipboardWriteTool = Tool.define("desktop_clipboard_write", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    text: z.string().describe("Text to place in the clipboard"),
  })
  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["clipboard"],
        always: [],
        metadata: { kind: "clipboard", summary: `Write ${params.text.length} characters to clipboard` },
      })

      if (nativeClipboardPreferred()) {
        await nativeWrite(params.text)
      } else {
        const { clipboard } = await getNut()
        await clipboard.setContent(params.text)
      }

      return {
        title: `Wrote ${params.text.length} characters to clipboard`,
        metadata: { length: params.text.length },
        output: JSON.stringify({ length: params.text.length }),
      }
    },
  }
})
