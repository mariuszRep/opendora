import { randomUUID } from "crypto"
import { EventEmitter } from "events"
import type { Message, MessagePart, PingOptions, PongOptions, SendPolicy, StreamOptions } from "./types.ts"
import { evaluateSendPolicy } from "./types.ts"

function toParts(content: string | MessagePart[]): MessagePart[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content
}

function validateParts(parts: MessagePart[]): void {
  if (parts.length === 0) {
    throw new TypeError("Message parts must not be empty")
  }
  for (const part of parts) {
    if ((part.type === "text" || part.type === "reasoning") && !part.text) {
      throw new TypeError(`Message part of type "${part.type}" must have a non-empty text string`)
    }
    if (part.type === "tool-invocation" && !part.toolName) {
      throw new TypeError('Message part of type "tool-invocation" must have a non-empty toolName')
    }
  }
}

export type MessageStream = {
  /** Push one part as it arrives from the provider. */
  write(part: MessagePart): void
  /** Finalise the message — assembles parts[], persists, and fires bus events. */
  end(): Promise<Message>
}

export class Session extends EventEmitter {
  readonly id: string
  private messages: Message[] = []
  private persist: (msg: Message) => Promise<void>
  private sendPolicy?: SendPolicy

  constructor(id: string, persist?: (msg: Message) => Promise<void>, sendPolicy?: SendPolicy) {
    super()
    this.id = id
    this.persist = persist ?? (() => Promise.resolve())
    this.sendPolicy = sendPolicy
  }

  async ping(opts: PingOptions): Promise<Message> {
    if (this.sendPolicy && evaluateSendPolicy(this.sendPolicy, opts.from) === "deny") {
      throw new Error(`Actor "${opts.from.id}" is not permitted to ping session "${this.id}"`)
    }
    const parts = toParts(opts.content)
    validateParts(parts)
    const msg: Message = {
      id: randomUUID(),
      sessionId: this.id,
      parent: opts.parent ?? null,
      from: opts.from,
      kind: "ping",
      parts,
      ...(opts.provenance !== undefined && { provenance: opts.provenance }),
      timestamp: Date.now(),
    }
    this.messages.push(msg)
    this.emit("ping", msg)
    await this.persist(msg)
    return msg
  }

  async pong(opts: PongOptions): Promise<Message> {
    if (this.sendPolicy && evaluateSendPolicy(this.sendPolicy, opts.from) === "deny") {
      throw new Error(`Actor "${opts.from.id}" is not permitted to pong session "${this.id}"`)
    }
    const parts = toParts(opts.content)
    validateParts(parts)
    const msg: Message = {
      id: randomUUID(),
      sessionId: this.id,
      parent: opts.parent,
      from: opts.from,
      kind: "pong",
      parts,
      ...(opts.provenance !== undefined && { provenance: opts.provenance }),
      timestamp: Date.now(),
    }
    this.messages.push(msg)
    this.emit("pong", msg)
    await this.persist(msg)
    return msg
  }

  stream(opts: StreamOptions): MessageStream {
    const id = randomUUID()
    const accumulated: MessagePart[] = []

    return {
      write: (part: MessagePart) => {
        accumulated.push(part)
        this.emit("stream:delta", { sessionId: this.id, messageId: id, part })
      },
      end: async () => {
        validateParts(accumulated)
        const msg: Message = {
          id,
          sessionId: this.id,
          parent: { messageId: opts.pingId },
          from: opts.from,
          kind: "pong",
          parts: accumulated,
          ...(opts.provenance !== undefined && { provenance: opts.provenance }),
          timestamp: Date.now(),
        }
        this.messages.push(msg)
        this.emit("pong", msg)
        await this.persist(msg)
        return msg
      },
    }
  }

  history(): Message[] {
    return [...this.messages]
  }

  thread(messageId: string): Message[] {
    const result: Message[] = []
    let current = this.messages.find((m) => m.id === messageId)
    while (current) {
      result.unshift(current)
      const parentMessageId = current.parent?.messageId
      current = parentMessageId ? this.messages.find((m) => m.id === parentMessageId) : undefined
    }
    return result
  }
}
