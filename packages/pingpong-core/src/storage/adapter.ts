import type { Message, SessionFilter, SessionMeta } from "../types.ts"

export interface StorageAdapter {
  // ─── Sessions ───────────────────────────────────────────────────────────────
  createSession(meta: SessionMeta): Promise<void>
  getSession(id: string): Promise<SessionMeta | null>
  updateSession(id: string, patch: Partial<SessionMeta>): Promise<void>
  listSessions(filter?: SessionFilter): Promise<SessionMeta[]>
  deleteSession(id: string): Promise<void>

  // ─── Messages ───────────────────────────────────────────────────────────────
  appendMessage(msg: Message): Promise<void>
  getMessages(sessionId: string): Promise<Message[]>
  getMessage(id: string): Promise<Message | null>
}
