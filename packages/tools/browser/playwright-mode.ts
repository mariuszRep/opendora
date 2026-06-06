import z from "zod"
import { Tool } from "../tool.ts"

const PLAYWRIGHT_EXECUTABLE_PATH = "/home/mariusz/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
const BASE_CMD = [
  "node",
  "packages/opencode/node_modules/@playwright/mcp/cli.js",
  `--executable-path=${PLAYWRIGHT_EXECUTABLE_PATH}`,
]

function apiBase() {
  return process.env.OPENCODE_URL ?? "http://localhost:4097"
}

export const PlaywrightModeTool = Tool.define("playwright_browser_mode", {
  description:
    "Switch the Playwright browser between headless and headed mode without restarting the MCP server. " +
    "Use 'headed' when the user needs to see the browser to authenticate or interact manually. " +
    "Use 'headless' for automated workflows that run without user interaction. " +
    "After this call returns, all playwright_browser_* tools work normally against the new browser instance.",
  parameters: z.object({
    mode: z
      .enum(["headed", "headless"])
      .describe("'headed' opens a visible browser window via WSLg. 'headless' runs the browser invisibly."),
  }),
  async execute(params) {
    const api = apiBase()
    const cmd = params.mode === "headless" ? [...BASE_CMD, "--headless"] : [...BASE_CMD]

    const disconnect = await fetch(`${api}/mcp/playwright/disconnect`, { method: "POST" })
    if (!disconnect.ok) throw new Error(`Disconnect failed: ${disconnect.status}`)

    const patch = await fetch(`${api}/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mcp: { playwright: { type: "local", command: cmd } } }),
    })
    if (!patch.ok) throw new Error(`Config update failed: ${patch.status}`)

    const connect = await fetch(`${api}/mcp/playwright/connect`, { method: "POST" })
    if (!connect.ok) throw new Error(`Connect failed: ${connect.status}`)

    const windowNote = params.mode === "headed" ? " A browser window is now visible on your desktop." : ""
    return {
      title: `Playwright: switched to ${params.mode}`,
      metadata: { mode: params.mode },
      output: `Browser restarted in ${params.mode} mode.${windowNote} All playwright_browser_* tools are ready.`,
    }
  },
})
