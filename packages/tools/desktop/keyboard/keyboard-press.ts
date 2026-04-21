import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { parseKeys } from "../lib/keys.ts"

export const DesktopKeyboardPressTool = Tool.define("desktop_keyboard_press", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description:
      "Press a key or key combination such as 'ctrl+c', 'enter', or 'ctrl+shift+t'. " +
      "Modifiers: ctrl, shift, alt, meta/cmd/win/super. " +
      "Special: enter, esc, space, tab, backspace, delete, insert, " +
      "up, down, left, right, home, end, pageup, pagedown. " +
      "Letters a-z, digits 0-9, function keys f1-f12.",
    parameters: z.object({
      keys: z
        .string()
        .min(1)
        .describe("Key or combination, e.g. 'ctrl+c', 'enter', 'ctrl+shift+t'"),
    }),
    formatValidationError(error) {
      return `desktop_keyboard_press: ${error.issues.map((i) => i.message).join(", ")}`
    },
    async execute(params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["keyboard"],
        always: [],
        metadata: { kind: "keyboard", summary: `Press ${params.keys}` },
      })

      const { keyboard } = await getNut()
      const resolved = await parseKeys(params.keys)

      await keyboard.pressKey(...resolved)
      await keyboard.releaseKey(...resolved)

      return {
        title: `Pressed ${params.keys}`,
        metadata: { keys: params.keys },
        output: JSON.stringify({ keys: params.keys }),
      }
    },
  }
})
