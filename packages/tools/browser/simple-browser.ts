import z from "zod"
import { Tool } from "../tool"

const BROWSER_URL = "http://localhost:8338"

const BrowserSchema = z.object({
  action: z.enum([
    "status",
    "start", 
    "stop",
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
  description: `Control a web browser to navigate, interact with web pages, and capture content.

Actions:
- status: Check if browser is running
- start: Start the browser
- stop: Stop the browser  
- open: Open a URL in new tab
- navigate: Navigate current/specific tab to URL
- snapshot: Get page content as text
- screenshot: Capture screenshot
- close: Close a tab
- tabs: List all open tabs

Examples:
- Open Google: {"action": "open", "url": "https://google.com"}
- Navigate: {"action": "navigate", "url": "https://example.com"}
- Get page content: {"action": "snapshot"}`,
  
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

        case "open": {
          if (!url) throw new Error("url is required for open action")
          const res = await fetch(`${BROWSER_URL}/tabs/open`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })
          const data = await res.json()
          return {
            title: `Opened ${url}`,
            output: JSON.stringify(data, null, 2),
            metadata: data as any,
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
          const data = await res.json()
          return {
            title: "Page Snapshot",
            output: (data as any).snapshot || JSON.stringify(data, null, 2),
            metadata: data as any,
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
