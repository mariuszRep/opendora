import type { NextRequest } from "next/server"

// Must not be cached or statically optimized — this is a live SSE stream.
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const BACKEND_URL = process.env.NEXT_PUBLIC_OPENDORA_URL ?? "http://localhost:4097"

/**
 * Explicit SSE proxy route.
 *
 * next.config.ts rewrites buffer responses in Turbopack dev mode, which breaks
 * SSE — all events arrive at once after the agent finishes instead of streaming.
 * An App Router route handler takes priority over rewrites and pipes the backend
 * ReadableStream directly to the browser, giving true chunk-by-chunk delivery.
 *
 * All other /api/* endpoints continue to go through the rewrite (they are
 * request-response, not streaming, so buffering is irrelevant for them).
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
  // No buffering, no transformation — events arrive the instant the backend emits them.
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
