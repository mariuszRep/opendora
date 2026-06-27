import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { parseKeys } from "../lib/keys.ts"
import toolDef from ".//keyboard-press.json"

export const DesktopKeyboardPressTool = Tool.define("desktop_keyboard_press", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    keys: z
      .string()
      .min(1)
      .describe("Key or combination, e.g. 'ctrl+c', 'enter', 'ctrl+shift+t'"),
  })
  return {
    description: toolDef.description,
    parameters,
    formatValidationError(error) {
      return `desktop_keyboard_press: ${error.issues.map((i) => i.message).join(", ")}`
    },
    async execute(params: z.infer<typeof parameters>, ctx) {
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
