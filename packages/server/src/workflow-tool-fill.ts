import z from "zod"
import { asSchema } from "ai"

export type ToolDefLike = {
  description: string
  parameters: z.ZodType
  formatValidationError?(error: z.ZodError): string
}

/** Fixed (configured) args are authoritative — they always win over agent-generated values. */
export function mergeArgs(
  llmArgs: Record<string, unknown>,
  fixedArgs: Record<string, unknown>,
): Record<string, unknown> {
  return { ...llmArgs, ...fixedArgs }
}

const MAX_PREVIEW_CHARS = 500

function previewValue(value: unknown): string {
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    return String(value)
  }
  if (json.length <= MAX_PREVIEW_CHARS) return json
  return json.slice(0, MAX_PREVIEW_CHARS) + "…"
}

/**
 * Actionable, field-level feedback for a failed validation: tool identity,
 * failing path(s), expected constraint(s), and the prior invalid value.
 * Prefers the tool's own formatter when it declares one.
 */
export function formatValidationFeedback(
  toolId: string,
  toolDef: Pick<ToolDefLike, "formatValidationError">,
  error: z.ZodError,
  invalidValue: unknown,
): string {
  if (toolDef.formatValidationError) {
    try {
      return toolDef.formatValidationError(error)
    } catch {
      // fall through to the generic formatter if the tool's own formatter throws
    }
  }
  const issues = error.issues
    .map((issue) => `  - ${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("\n")
  return [
    `Arguments for tool \`${toolId}\` failed schema validation:`,
    issues,
    `Previous value:\n${previewValue(invalidValue)}`,
  ].join("\n\n")
}

/**
 * Derive a provider-facing JSON Schema from a tool's Zod schema, using the
 * same approach as the direct tool-call path (packages/session/src/prompt.ts's
 * resolveTools) for schema-representation parity between direct and workflow calls.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema) as Record<string, unknown>
  } catch {
    return asSchema(schema).jsonSchema as Record<string, unknown>
  }
}
