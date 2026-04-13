// Stub for openclaw/plugin-sdk/text-runtime
export function normalizeOptionalString(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

export function readStringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return undefined
  return String(value)
}
