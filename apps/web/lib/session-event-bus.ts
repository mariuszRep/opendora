import { opendora, type Event } from "./projectflows"

type Listener = (event: Event) => void

let unsubscribeFromSource: (() => void) | null = null
const listeners = new Set<Listener>()

/**
 * Multiple SessionPane instances would otherwise each open their own EventSource
 * (opendora.events.subscribe is not a singleton) and risk the browser's per-origin
 * connection cap. This multiplexes one shared subscription to N listeners instead.
 */
export function subscribeToEvents(listener: Listener): () => void {
  listeners.add(listener)
  if (!unsubscribeFromSource) {
    unsubscribeFromSource = opendora.events.subscribe((event) => {
      for (const l of listeners) l(event)
    })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && unsubscribeFromSource) {
      unsubscribeFromSource()
      unsubscribeFromSource = null
    }
  }
}
