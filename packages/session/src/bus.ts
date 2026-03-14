import type { Message, MessagePart, SessionMeta } from "./types.ts"

// ─── Event catalogue ─────────────────────────────────────────────────────────

export type BusEventMap = {
  "session.created":    { meta: SessionMeta }
  "session.updated":    { id: string; patch: Partial<SessionMeta> }
  "session.archived":   { id: string }
  "session.closed":     { id: string }
  "session.deleted":    { id: string }
  "session.error":      { sessionId: string; error: unknown }
  "message.appended":   { message: Message }
  "message.part.delta": { sessionId: string; messageId: string; part: MessagePart }
  "retention.evicted":  { sessionId: string; evictedCount: number }
}

export type BusHandle = symbol

type Handler<T> = (payload: T) => void

// ─── Bus ─────────────────────────────────────────────────────────────────────

class BusImpl {
  private handlers = new Map<string, Map<BusHandle, Handler<unknown>>>()

  subscribe<K extends keyof BusEventMap>(type: K, handler: Handler<BusEventMap[K]>): BusHandle {
    if (!this.handlers.has(type)) this.handlers.set(type, new Map())
    const handle: BusHandle = Symbol(type)
    this.handlers.get(type)!.set(handle, handler as Handler<unknown>)
    return handle
  }

  unsubscribe(handle: BusHandle): void {
    for (const map of this.handlers.values()) {
      if (map.delete(handle)) return
    }
  }

  publish<K extends keyof BusEventMap>(type: K, payload: BusEventMap[K]): void {
    const map = this.handlers.get(type)
    if (!map) return
    for (const handler of map.values()) {
      handler(payload)
    }
  }
}

// Next.js (and any multi-bundle environment) may load this module more than
// once, producing separate instances. Storing the singleton on `global`
// ensures every import site shares the exact same Bus instance.
const g = global as typeof global & { _pingpong_bus?: BusImpl }
if (!g._pingpong_bus) g._pingpong_bus = new BusImpl()
export const Bus: BusImpl = g._pingpong_bus
