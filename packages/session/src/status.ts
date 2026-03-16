import z from "zod"
import { getConfig } from "./config"

// Inline BusEvent.define
function defineBusEvent<Type extends string>(type: Type, properties: z.ZodType<any>) {
  return { type, properties }
}

// Minimal instance state — uses a module-level map (no Instance.state required)
const _state: Record<string, SessionStatus.Info> = {}

export namespace SessionStatus {
  export const Info = z
    .union([
      z.object({ type: z.literal("idle") }),
      z.object({ type: z.literal("retry"), attempt: z.number(), message: z.string(), next: z.number() }),
      z.object({ type: z.literal("busy") }),
    ])
    .meta({ ref: "SessionStatus" })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Status: defineBusEvent(
      "session.status",
      z.object({ sessionID: z.string(), status: Info }),
    ),
    // deprecated
    Idle: defineBusEvent(
      "session.idle",
      z.object({ sessionID: z.string() }),
    ),
  }

  export function get(sessionID: string): Info {
    return _state[sessionID] ?? { type: "idle" }
  }

  export function list(): Record<string, Info> {
    return _state
  }

  export function set(sessionID: string, status: Info) {
    const bus = getConfig().bus
    bus?.publish(Event.Status, { sessionID, status })
    if (status.type === "idle") {
      // deprecated
      bus?.publish(Event.Idle, { sessionID })
      delete _state[sessionID]
      return
    }
    _state[sessionID] = status
  }
}
