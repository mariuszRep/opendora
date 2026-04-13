// Minimal standalone browser server for OpenDora
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core"

let browser: Browser | null = null
let context: BrowserContext | null = null
let pages: Map<string, Page> = new Map()
let lastActiveId: string | null = null

/** Remove any pages that have been closed by the browser */
function pruneClosedPages() {
  for (const [id, page] of pages) {
    if (page.isClosed()) {
      pages.delete(id)
      if (lastActiveId === id) lastActiveId = null
    }
  }
}

/** Get the page to operate on: prefer lastActiveId, fall back to most-recent entry */
function resolvePage(targetId?: string): Page | null {
  pruneClosedPages()
  if (targetId && pages.has(targetId)) return pages.get(targetId)!
  if (lastActiveId && pages.has(lastActiveId)) return pages.get(lastActiveId)!
  // last inserted entry
  const entries = Array.from(pages.entries())
  return entries.length ? entries[entries.length - 1][1] : null
}

async function ensureContext(): Promise<BrowserContext> {
  if (!browser || !context) {
    browser = await chromium.launch({ headless: false })
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    })
  }
  return context
}

async function openPage(url: string): Promise<{ targetId: string; finalUrl: string }> {
  const ctx = await ensureContext()
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
  // Extra settle for JS-heavy pages
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
  const targetId = crypto.randomUUID()
  pages.set(targetId, page)
  lastActiveId = targetId
  return { targetId, finalUrl: page.url() }
}

async function getSnapshot(page: Page) {
  const content = await page.content()
  // Strip script/style noise to keep it LLM-readable
  const stripped = content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s{3,}/g, "  ")
  return {
    targetId: Array.from(pages.entries()).find(([, p]) => p === page)?.[0],
    url: page.url(),
    title: await page.title().catch(() => ""),
    snapshot: stripped,
  }
}

export async function startBrowserServer(port: number = 8338) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)

      try {
        // ── Status ──────────────────────────────────────────────────────────
        if (url.pathname === "/" && req.method === "GET") {
          pruneClosedPages()
          const tabs = await Promise.all(
            Array.from(pages.entries()).map(async ([id, page]) => ({
              targetId: id,
              url: page.url(),
              title: await page.title().catch(() => ""),
              isActive: id === lastActiveId,
            })),
          )
          return Response.json({ running: browser !== null, tabs, lastActiveId })
        }

        // ── Start ────────────────────────────────────────────────────────────
        if (url.pathname === "/start" && req.method === "POST") {
          await ensureContext()
          return Response.json({ running: true })
        }

        // ── Stop ─────────────────────────────────────────────────────────────
        if (url.pathname === "/stop" && req.method === "POST") {
          if (browser) {
            await browser.close()
            browser = null
            context = null
            pages.clear()
            lastActiveId = null
          }
          return Response.json({ running: false })
        }

        // ── Open tab ─────────────────────────────────────────────────────────
        if (url.pathname === "/tabs/open" && req.method === "POST") {
          const body = (await req.json()) as { url: string }
          const { targetId, finalUrl } = await openPage(body.url)
          return Response.json({ targetId, url: finalUrl })
        }

        // ── Navigate ─────────────────────────────────────────────────────────
        if (url.pathname === "/navigate" && req.method === "POST") {
          const body = (await req.json()) as { url: string; targetId?: string }
          let page = resolvePage(body.targetId)
          if (!page) {
            const ctx = await ensureContext()
            page = await ctx.newPage()
            const targetId = crypto.randomUUID()
            pages.set(targetId, page)
            lastActiveId = targetId
          } else {
            // mark this tab as active
            const id = Array.from(pages.entries()).find(([, p]) => p === page)?.[0]
            if (id) lastActiveId = id
          }
          await page.goto(body.url, { waitUntil: "domcontentloaded", timeout: 30000 })
          await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})
          const targetId = Array.from(pages.entries()).find(([, p]) => p === page)?.[0]!
          return Response.json({ targetId, url: page.url() })
        }

        // ── Browse (open + snapshot in one call) ─────────────────────────────
        if (url.pathname === "/browse" && req.method === "POST") {
          const body = (await req.json()) as { url: string }
          const { targetId } = await openPage(body.url)
          const page = pages.get(targetId)!
          if (page.isClosed()) {
            return Response.json({ error: "Page closed after navigation" }, { status: 500 })
          }
          const snap = await getSnapshot(page)
          return Response.json({ ...snap, targetId })
        }

        // ── Snapshot ─────────────────────────────────────────────────────────
        if (url.pathname === "/snapshot" && req.method === "POST") {
          const body = (await req.json()) as { targetId?: string }
          const page = resolvePage(body.targetId)
          if (!page) {
            return Response.json({ error: "No open page. Use open or browse first." }, { status: 400 })
          }
          if (page.isClosed()) {
            return Response.json({ error: "Page is closed. Use open or browse to load a URL." }, { status: 400 })
          }
          return Response.json(await getSnapshot(page))
        }

        // ── Screenshot ───────────────────────────────────────────────────────
        if (url.pathname === "/screenshot" && req.method === "POST") {
          const body = (await req.json()) as { targetId?: string; fullPage?: boolean }
          const page = resolvePage(body.targetId)
          if (!page || page.isClosed()) {
            return Response.json({ error: "No open page available" }, { status: 400 })
          }
          const screenshot = await page.screenshot({ fullPage: body.fullPage })
          const path = `/tmp/screenshot-${Date.now()}.png`
          await Bun.write(path, screenshot)
          return Response.json({ path, url: page.url() })
        }

        // ── List tabs ────────────────────────────────────────────────────────
        if (url.pathname === "/tabs" && req.method === "GET") {
          pruneClosedPages()
          const tabs = Array.from(pages.entries()).map(([id, page]) => ({
            targetId: id,
            url: page.url(),
            isActive: id === lastActiveId,
          }))
          return Response.json({ tabs })
        }

        // ── Close tab ────────────────────────────────────────────────────────
        if (url.pathname.startsWith("/tabs/") && req.method === "DELETE") {
          const targetId = decodeURIComponent(url.pathname.slice("/tabs/".length))
          const page = pages.get(targetId)
          if (page) {
            await page.close().catch(() => {})
            pages.delete(targetId)
            if (lastActiveId === targetId) lastActiveId = null
          }
          return Response.json({ closed: true })
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
    lastActiveId = null
  }
}
