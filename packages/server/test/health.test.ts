import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { Installation } from "@projectflows/util/installation"
import { GlobalRoutes } from "@projectflows/server/routes/global"
import { Log } from "@projectflows/util/log"

let server: ReturnType<typeof Bun.serve>

beforeAll(() => {
  Log.init({ print: false })

  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)

      // Route /health through GlobalRoutes (mounted at /global in server)
      // Strip /global prefix for internal routing
      if (url.pathname === "/global/health" || url.pathname.startsWith("/global/")) {
        const app = GlobalRoutes()
        // Clone request with stripped /global prefix
        const newUrl = new URL(req.url)
        newUrl.pathname = newUrl.pathname.replace(/^\/global/, "")
        const newReq = new Request(newUrl.toString(), req)
        return app.fetch(newReq, { port: server.port } as any)
      }

      return new Response("Not Found", { status: 404 })
    },
  })
})

afterAll(() => {
  server?.stop()
})

describe("GET /health", () => {
  test("returns healthy status and version", async () => {
    const response = await fetch(`http://localhost:${server.port}/global/health`)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")

    const body = await response.json() as { healthy: boolean; version: string }

    expect(body.healthy).toBe(true)
    expect(body.version).toBe(Installation.VERSION)
  })

  test("returns correct JSON schema", async () => {
    const response = await fetch(`http://localhost:${server.port}/global/health`)

    const body = await response.json() as { healthy: boolean; version: string }

    expect(typeof body.healthy).toBe("boolean")
    expect(typeof body.version).toBe("string")
    expect(body.version.length).toBeGreaterThan(0)
  })
})