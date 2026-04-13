import { Tool } from "../tool"
import { createBrowserTool } from "./src/browser-tool"

/**
 * Adapter to convert OpenClaw's browser tool to OpenDora's Tool.define format
 */
export const BrowserTool = Tool.define("browser", async (initCtx) => {
  // Create OpenClaw's browser tool
  const openclawBrowserTool = createBrowserTool({
    sandboxBridgeUrl: undefined,
    allowHostControl: true,
    agentSessionKey: undefined,
  })

  return {
    description: openclawBrowserTool.description,
    parameters: openclawBrowserTool.parameters,
    async execute(args, ctx) {
      // Execute OpenClaw's browser tool
      const result = await openclawBrowserTool.execute(
        ctx.callID || crypto.randomUUID(),
        args
      )

      // Convert OpenClaw's result format to OpenDora's format
      return {
        title: "Browser Action",
        output: JSON.stringify(result, null, 2),
        metadata: { result },
      }
    },
  }
})
