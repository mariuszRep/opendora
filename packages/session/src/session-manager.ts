import { Session } from "./pingpong-session.ts"
import { SessionQueue } from "./session-queue.ts"
import type { StorageAdapter } from "./storage/adapter.ts"
import type { CreateSessionOptions, Message, MessagePart, PongOptions, SendPolicy, SessionFilter, SessionMeta, SessionType } from "./types.ts"
import { DEFAULT_RETENTION } from "./types.ts"
import { Bus } from "./bus.ts"

export class SessionManager {
  private sessions = new Map<string, Session>()
  private storage: StorageAdapter
  readonly queue = new SessionQueue()

  constructor(storage: StorageAdapter) {
    this.storage = storage
  }

  // ─── Create ─────────────────────────────────────────────────────────────────

  async create(id: string, opts: CreateSessionOptions): Promise<Session> {
    if (this.sessions.has(id)) throw new Error(`Session "${id}" already exists`)

    const meta: SessionMeta = {
      id,
      type: opts.type,
      status: "active",
      label: opts.label,
      parent: opts.parent,
      ...(opts.spawnDepth   !== undefined && { spawnDepth:   opts.spawnDepth }),
      retention: { ...DEFAULT_RETENTION[opts.type], ...opts.retention },
      ...(opts.sendPolicy   !== undefined && { sendPolicy:   opts.sendPolicy }),
      ...(opts.agentId      !== undefined && { agentId:      opts.agentId }),
      ...(opts.toolPolicy   !== undefined && { toolPolicy:   opts.toolPolicy }),
      ...(opts.systemPrompt !== undefined && { systemPrompt: opts.systemPrompt }),
      ...(opts.defaultPath  !== undefined && { defaultPath:  opts.defaultPath }),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await this.storage.createSession(meta)
    Bus.publish("session.created", { meta })
    const session = this.mount(id, meta.sendPolicy)
    return session
  }

  // ─── Get ─────────────────────────────────────────────────────────────────────

  get(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  async getOrCreate(id: string, opts: CreateSessionOptions): Promise<Session> {
    if (this.sessions.has(id)) return this.sessions.get(id)!
    const existing = await this.storage.getSession(id)
    if (existing) return this.mount(id, existing.sendPolicy)
    return this.create(id, opts)
  }

  async getMeta(id: string): Promise<SessionMeta | null> {
    return this.storage.getSession(id)
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  async list(filter?: SessionFilter): Promise<SessionMeta[]> {
    return this.storage.listSessions(filter)
  }

  async listByType(type: SessionType): Promise<SessionMeta[]> {
    return this.storage.listSessions({ type })
  }

  async children(sessionId: string): Promise<SessionMeta[]> {
    return this.storage.listSessions({ parentId: sessionId })
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async archive(id: string): Promise<void> {
    await this.storage.updateSession(id, { status: "archived", archivedAt: Date.now() })
    this.sessions.delete(id)
    Bus.publish("session.archived", { id })
  }

  async close(id: string): Promise<void> {
    await this.storage.updateSession(id, { status: "closed" })
    this.sessions.delete(id)
    Bus.publish("session.closed", { id })
  }

  async reopen(id: string): Promise<Session> {
    const meta = await this.storage.getSession(id)
    if (!meta) throw new Error(`Session "${id}" not found`)
    if (meta.status === "active") return this.sessions.get(id) ?? this.mount(id)
    await this.storage.updateSession(id, { status: "active" })
    Bus.publish("session.updated", { id, patch: { status: "active" } })
    return this.mount(id, meta.sendPolicy)
  }

  async delete(id: string): Promise<void> {
    const kids = await this.children(id)
    for (const child of kids) {
      await this.delete(child.id)
    }
    await this.storage.deleteSession(id)
    this.sessions.delete(id)
    Bus.publish("session.deleted", { id })
  }

  // ─── Pong ────────────────────────────────────────────────────────────────────

  async pong(id: string, opts: PongOptions): Promise<Message> {
    const meta = await this.storage.getSession(id)
    if (!meta) throw new Error(`Session "${id}" not found`)
    const session = this.sessions.get(id) ?? this.mount(id, meta.sendPolicy)
    return session.pong(opts)
  }

  async update(id: string, patch: Partial<SessionMeta>): Promise<void> {
    await this.storage.updateSession(id, patch)
    Bus.publish("session.updated", { id, patch })
  }

  async share(id: string, url: string): Promise<void> {
    await this.storage.updateSession(id, { share: { url } })
    Bus.publish("session.updated", { id, patch: { share: { url } } })
  }

  async unshare(id: string): Promise<void> {
    await this.storage.updateSession(id, { share: undefined })
    Bus.publish("session.updated", { id, patch: { share: undefined } })
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private mount(id: string, sendPolicy?: SendPolicy): Session {
    const persist = async (msg: Message) => {
      try {
        await this.storage.appendMessage(msg)
        Bus.publish("message.appended", { message: msg })
      } catch (err) {
        console.error(`[pingpong] failed to persist message ${msg.id} in session ${msg.sessionId}:`, err)
        Bus.publish("session.error", { sessionId: msg.sessionId, error: err })
        throw err
      }
    }

    const session = new Session(id, persist, sendPolicy)
    session.on("stream:delta", (delta: { sessionId: string; messageId: string; part: MessagePart }) => {
      Bus.publish("message.part.delta", delta)
    })

    this.sessions.set(id, session)
    return session
  }
}
