import z from "zod"
import type { ZodType } from "zod"
import { Log } from "../util/log"

export namespace BusEvent {
  const log = Log.create({ service: "event" })

  export type Definition = ReturnType<typeof define>

  const registry = new Map<string, Definition>()

  export function define<Type extends string, Properties extends ZodType>(type: Type, properties: Properties) {
    const result = {
      type,
      properties,
    }
    registry.set(type, result)
    return result
  }

  export const ProviderAuthExpired = define(
    "provider.auth.expired",
    z.object({ providerID: z.string(), providerName: z.string() }),
  )

  export const ProviderTimedOut = define(
    "provider.timeout",
    z.object({
      providerID: z.string(),
      providerName: z.string(),
      reason: z.string(),
      resetAt: z.number(),
      resetInSeconds: z.number(),
      failedModels: z.array(z.string()),
    }),
  )

  export const ProviderRecovered = define(
    "provider.recovered",
    z.object({
      providerID: z.string(),
      providerName: z.string(),
    }),
  )

  export const SkillsUpdated = define(
    "skill.updated",
    z.object({}),
  )

  export function payloads() {
    return z
      .discriminatedUnion(
        "type",
        registry
          .entries()
          .map(([type, def]) => {
            return z
              .object({
                type: z.literal(type),
                properties: def.properties,
              })
              .meta({
                ref: "Event" + "." + def.type,
              })
          })
          .toArray() as any,
      )
      .meta({
        ref: "Event",
      })
  }
}
