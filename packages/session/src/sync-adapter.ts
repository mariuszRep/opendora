/**
 * Transport-agnostic contract for replicating local Bus events to a remote server
 * and receiving server events back onto the local Bus.
 *
 * Core defines only this interface. Queuing, retry, and reconnect logic live in
 * the concrete adapter implementation (e.g. the WebSocket adapter in @pingpong/ui).
 */
export interface SyncAdapter {
  /** Called by core after every Bus event that should be forwarded to the server. */
  publish(event: string, data: unknown): void
  /** Called by the bridge when the server pushes an event down to the local Bus. */
  onServerEvent(handler: (event: string, data: unknown) => void): () => void
}
