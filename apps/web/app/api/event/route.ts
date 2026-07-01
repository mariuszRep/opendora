import type { NextRequest } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_PROJECTFLOWS_URL ?? "http://localhost:4097"

/**
 * SSE proxy route — takes priority over next.config.ts rewrites.
 *
 * Turbopack dev mode buffers responses that go through rewrites, so SSE events
 * all arrive at once after the agent finishes instead of streaming incrementally.
 * A route handler bypasses that buffering by piping the backend ReadableStream
 * directly to the browser.
 *
 * In embedded/static-export builds this file is excluded automatically (no
 * `force-dynamic` export means Next.js treats it as a normal server route and
 * simply omits it from the `output: "export"` bundle).
 */
export async function GET(request: NextRequest) {
  let backendRes: Response
  try {
    backendRes = await fetch(`${BACKEND_URL}/event`, {
      headers: {
        Accept: "text/event-stream",
        // Disable compression — SSE chunks must be forwarded as-is.
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
      },
      // Abort the backend connection when the browser disconnects.
      signal: request.signal,
    })
  } catch {
    // Backend not yet up — EventSource will retry automatically.
    return new Response(null, { status: 503 })
  }

  // Pipe the backend ReadableStream straight to the browser.
  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  })
}
