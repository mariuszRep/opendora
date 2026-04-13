import z from "zod"
import { Tool } from "../tool"

const BROWSER_URL = "http://localhost:8338"

const BrowserSchema = z.object({
  action: z.enum([
    "status",
    "start",
    "stop",
    "browse",
    "open",
    "navigate",
    "snapshot",
    "screenshot",
    "close",
    "tabs",
  ]),
  url: z.string().optional(),
  targetId: z.string().optional(),
  profile: z.string().optional(),
})

export const BrowserTool = Tool.define("browser", {
  description: `Control a web browser to navigate web pages and read their content.

## PREFERRED WORKFLOW
Use \`browse\` whenever you want to open AND read a page — it does both in one step and is the most reliable action.

\`\`\`
{"action": "browse", "url": "https://news.google.com/search?q=OpenAI"}
\`\`\`

The response includes \`targetId\`, \`url\`, \`title\`, and \`snapshot\` (cleaned HTML).

## OTHER ACTIONS
- \`status\`    — check if the browser is running and list open tabs
- \`start\`     — start the browser
- \`stop\`      — stop the browser
- \`open\`      — open a URL in a new tab (returns \`targetId\`, does NOT return page content)
- \`navigate\`  — navigate an existing tab to a new URL; pass \`targetId\` to target a specific tab
- \`snapshot\`  — read page content; pass the \`targetId\` returned by open/navigate/browse
- \`screenshot\`— save a screenshot to /tmp; pass \`targetId\` to target a specific tab
- \`close\`     — close a tab by \`targetId\`
- \`tabs\`      — list all open tabs

## IMPORTANT
- Always pass \`targetId\` from a previous open/navigate/browse call when using snapshot/screenshot/navigate/close.
- If snapshot returns an error, call \`browse\` with the URL again rather than retrying snapshot.
- Avoid opening multiple tabs for the same URL — check \`tabs\` first.`,
  
  parameters: BrowserSchema,
  
  async execute(args, ctx) {
    const { action, url, targetId, profile } = args

    await ctx.ask({
      permission: "browser",
      patterns: [action],
      always: ["*"],
      metadata: { action, url },
    })

    // Helper to check if browser server is reachable
    const checkServerHealth = async (): Promise<{ healthy: boolean; status?: any }> => {
      try {
        const res = await fetch(`${BROWSER_URL}/`, { 
          signal: AbortSignal.timeout(5000) 
        })
        const status = await res.json() as any
        return { healthy: true, status }
      } catch (error: any) {
        if (error.cause?.code === "ECONNREFUSED" || error.name === "TimeoutError") {
          return { healthy: false }
        }
        throw error
      }
    }

    // Helper to start browser server (would need to be wired into OpenDora startup)
    const startBrowserServer = async () => {
      // For now, we can't start the server from here
      // The server needs to be started by OpenDora's core
      throw new Error(
        `Browser server is not running at ${BROWSER_URL}.\n\n` +
        `The browser server needs to be started separately. ` +
        `This will be integrated into OpenDora's startup in the future.`
      )
    }

    // Helper to ensure browser is started
    const ensureStarted = async () => {
      const health = await checkServerHealth()
      
      if (!health.healthy) {
        // Server not running - try to provide helpful error
        return {
          serverRunning: false,
          error: "Browser server not reachable",
          message: `Cannot connect to browser server at ${BROWSER_URL}. Please ensure the browser server is running.`
        }
      }

      const status = health.status
      
      // Server is running but browser might not be started
      if (!status.running) {
        try {
          await fetch(`${BROWSER_URL}/start`, { method: "POST" })
          const newHealth = await checkServerHealth()
          return { serverRunning: true, browserStarted: true, status: newHealth.status }
        } catch (error) {
          return {
            serverRunning: true,
            browserStarted: false,
            error: "Failed to start browser",
            message: String(error)
          }
        }
      }
      
      return { serverRunning: true, browserStarted: true, status }
    }

    try {
      switch (action) {
        case "status": {
          const health = await checkServerHealth()
          if (!health.healthy) {
            return {
              title: "Browser Server Not Running",
              output: `Browser control server is not running at ${BROWSER_URL}.\n\nThe browser server needs to be started separately.`,
              metadata: { serverRunning: false, browserRunning: false },
            }
          }
          return {
            title: "Browser Status",
            output: JSON.stringify(health.status, null, 2),
            metadata: health.status,
          }
        }

        case "start": {
          const health = await checkServerHealth()
          if (!health.healthy) {
            return {
              title: "Browser Server Not Running",
              output: `Cannot start browser - server not running at ${BROWSER_URL}`,
              metadata: { serverRunning: false },
            }
          }
          const res = await fetch(`${BROWSER_URL}/start`, { method: "POST" })
          const data = await res.json()
          return {
            title: "Browser Started",
            output: JSON.stringify(data, null, 2),
            metadata: data as any,
          }
        }

        case "stop": {
          const res = await fetch(`${BROWSER_URL}/stop`, { method: "POST" })
          const data = await res.json()
          return {
            title: "Browser Stopped",
            output: JSON.stringify(data, null, 2),
            metadata: data as any,
          }
        }

        case "browse": {
          if (!url) throw new Error("url is required for browse action")
          const res = await fetch(`${BROWSER_URL}/browse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })
          const data = await res.json() as any
          if (data.error) {
            return {
              title: `Browse failed: ${url}`,
              output: `Error: ${data.error}\n\nTry a different URL or check the page is accessible.`,
              metadata: data,
            }
          }
          return {
            title: `Browsed: ${data.title || url}`,
            output: `URL: ${data.url}\nTitle: ${data.title}\ntargetId: ${data.targetId}\n\n${data.snapshot}`,
            metadata: { targetId: data.targetId, url: data.url, title: data.title },
          }
        }

        case "open": {
          if (!url) throw new Error("url is required for open action")
          const res = await fetch(`${BROWSER_URL}/tabs/open`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })
          const data = await res.json() as any
          return {
            title: `Opened ${url}`,
            output: `Tab opened.\ntargetId: ${data.targetId}\nfinalUrl: ${data.url}\n\nUse snapshot with this targetId to read the page content.`,
            metadata: data,
          }
        }

        case "navigate": {
          if (!url) throw new Error("url is required for navigate action")
          
          // Ensure browser is running before navigating
          await ensureStarted()
          
          const res = await fetch(`${BROWSER_URL}/navigate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, targetId }),
          })
          const data = await res.json()
          return {
            title: `Navigated to ${url}`,
            output: JSON.stringify(data, null, 2),
            metadata: data as any,
          }
        }

        case "snapshot": {
          const res = await fetch(`${BROWSER_URL}/snapshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetId }),
          })
          const data = await res.json() as any
          if (data.error) {
            return {
              title: "Snapshot failed",
              output: `Error: ${data.error}\n\nUse browse action with the URL to reload the page.`,
              metadata: data,
            }
          }
          return {
            title: `Snapshot: ${data.title || data.url}`,
            output: `URL: ${data.url}\nTitle: ${data.title}\ntargetId: ${data.targetId}\n\n${data.snapshot}`,
            metadata: { targetId: data.targetId, url: data.url, title: data.title },
          }
        }

        case "screenshot": {
          const res = await fetch(`${BROWSER_URL}/screenshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetId }),
          })
          const data = await res.json()
          return {
            title: "Screenshot Captured",
            output: JSON.stringify(data, null, 2),
            metadata: data as any,
          }
        }

        case "close": {
          if (!targetId) throw new Error("targetId is required for close action")
          const res = await fetch(`${BROWSER_URL}/tabs/${encodeURIComponent(targetId)}`, {
            method: "DELETE",
          })
          const data = await res.json()
          return {
            title: "Tab Closed",
            output: JSON.stringify(data, null, 2),
            metadata: data as any,
          }
        }

        case "tabs": {
          const res = await fetch(`${BROWSER_URL}/tabs`)
          const data = await res.json()
          return {
            title: "Browser Tabs",
            output: JSON.stringify(data, null, 2),
            metadata: data as any,
          }
        }

        default:
          throw new Error(`Unknown action: ${action}`)
      }
    } catch (error: any) {
      if (error.cause?.code === "ECONNREFUSED") {
        return {
          title: "Browser Server Not Running",
          output: `Cannot connect to browser server at ${BROWSER_URL}. Please start the browser control server first.`,
          metadata: { error: "ECONNREFUSED" },
        }
      }
      throw error
    }
  },
})
