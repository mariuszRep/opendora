// Minimal standalone browser server for OpenDora
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core"

let browser: Browser | null = null
let context: BrowserContext | null = null
let pages: Map<string, Page> = new Map()

export async function startBrowserServer(port: number = 8338) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      
      try {
        // Status endpoint
        if (url.pathname === "/" && req.method === "GET") {
          const tabs = await Promise.all(
            Array.from(pages.entries()).map(async ([id, page]) => ({
              targetId: id,
              url: page.url(),
              title: await page.title().catch(() => ""),
            }))
          )
          return Response.json({
            running: browser !== null,
            tabs,
          })
        }

        // Start browser
        if (url.pathname === "/start" && req.method === "POST") {
          if (!browser) {
            browser = await chromium.launch({ headless: false })
            context = await browser.newContext()
          }
          return Response.json({ running: true })
        }

        // Stop browser
        if (url.pathname === "/stop" && req.method === "POST") {
          if (browser) {
            await browser.close()
            browser = null
            context = null
            pages.clear()
          }
          return Response.json({ running: false })
        }

        // Open tab
        if (url.pathname === "/tabs/open" && req.method === "POST") {
          const body = await req.json() as { url: string }
          if (!context) {
            browser = await chromium.launch({ headless: false })
            context = await browser.newContext()
          }
          const page = await context.newPage()
          await page.goto(body.url)
          const targetId = crypto.randomUUID()
          pages.set(targetId, page)
          return Response.json({ targetId, url: page.url() })
        }

        // Navigate
        if (url.pathname === "/navigate" && req.method === "POST") {
          const body = await req.json() as { url: string; targetId?: string }
          if (!context) {
            browser = await chromium.launch({ headless: false })
            context = await browser.newContext()
          }
          
          let page: Page
          if (body.targetId && pages.has(body.targetId)) {
            page = pages.get(body.targetId)!
          } else {
            page = await context.newPage()
            const targetId = crypto.randomUUID()
            pages.set(targetId, page)
          }
          
          await page.goto(body.url)
          const targetId = Array.from(pages.entries()).find(([_, p]) => p === page)?.[0] || crypto.randomUUID()
          return Response.json({ targetId, url: page.url() })
        }

        // Snapshot
        if (url.pathname === "/snapshot" && req.method === "POST") {
          const body = await req.json() as { targetId?: string }
          const page = body.targetId && pages.has(body.targetId) 
            ? pages.get(body.targetId)!
            : Array.from(pages.values())[0]
          
          if (!page) {
            return Response.json({ error: "No page available" }, { status: 400 })
          }
          
          const content = await page.content()
          return Response.json({
            targetId: Array.from(pages.entries()).find(([_, p]) => p === page)?.[0],
            url: page.url(),
            title: await page.title(),
            snapshot: content,
          })
        }

        // Screenshot
        if (url.pathname === "/screenshot" && req.method === "POST") {
          const body = await req.json() as { targetId?: string; fullPage?: boolean }
          const page = body.targetId && pages.has(body.targetId)
            ? pages.get(body.targetId)!
            : Array.from(pages.values())[0]
          
          if (!page) {
            return Response.json({ error: "No page available" }, { status: 400 })
          }
          
          const screenshot = await page.screenshot({ fullPage: body.fullPage })
          const path = `/tmp/screenshot-${Date.now()}.png`
          await Bun.write(path, screenshot)
          
          return Response.json({ path })
        }

        // List tabs
        if (url.pathname === "/tabs" && req.method === "GET") {
          const tabs = Array.from(pages.entries()).map(([id, page]) => ({
            targetId: id,
            url: page.url(),
          }))
          return Response.json({ tabs })
        }

        return Response.json({ error: "Not found" }, { status: 404 })
      } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
      }
    },
  })

  console.log(`Browser server listening on http://localhost:${port}`)
  return server
}

export async function stopBrowserServer() {
  if (browser) {
    await browser.close()
    browser = null
    context = null
    pages.clear()
  }
}
