export class SessionQueue {
  private queues = new Map<string, Promise<void>>()

  enqueue(sessionId: string, task: () => Promise<void>): Promise<void> {
    const current = this.queues.get(sessionId) ?? Promise.resolve()
    const next = current.then(task)
    // Keep the chain alive even if this task fails, so future tasks still run
    this.queues.set(sessionId, next.catch(() => {}))
    return next
  }
}
