import z from "zod"

export namespace Plugin {
  export const CapabilityType = z.enum(["agent", "skill", "tool", "workflow", "mcp", "automation", "ui", "tool-group"])
  export type CapabilityType = z.infer<typeof CapabilityType>

  export const Capability = z.object({
    type: CapabilityType,
    name: z.string(),
    sourceGroup: z.string().optional(),
    group: z.string().optional(),
  })
  export type Capability = z.infer<typeof Capability>

  export const Manifest = z.object({
    pluginId: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    capabilities: z.array(Capability),
    description: z.string().optional(),
    author: z.string().optional(),
    license: z.string().optional(),
    homepage: z.string().optional(),
    configSchema: z.record(z.string(), z.unknown()).optional(),
    dependencies: z.array(z.string()).optional(),
    category: z.string().optional(),
    status: z.string().optional(),
    provided: z.enum(["core", "entity"]).optional(),
    tags: z.array(z.string()).optional(),
  })
  export type Manifest = z.infer<typeof Manifest>

  export class InvalidManifestError extends Error {
    constructor(
      public readonly issues: z.core.$ZodIssue[],
      cause?: unknown,
    ) {
      super(`Invalid plugin manifest: ${issues.map((i) => i.message).join("; ")}`)
      this.name = "InvalidManifestError"
      if (cause) this.cause = cause
    }
  }

  export function validate(raw: unknown): Manifest {
    const result = Manifest.safeParse(raw)
    if (!result.success) throw new InvalidManifestError(result.error.issues)
    return result.data
  }
}
