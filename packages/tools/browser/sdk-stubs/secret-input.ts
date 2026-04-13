// Stub for openclaw/plugin-sdk/secret-input
export interface SecretInput {
  type: "secret"
  value: string
}

export function isSecretInput(value: unknown): value is SecretInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "secret" &&
    "value" in value &&
    typeof value.value === "string"
  )
}

export function readSecretValue(input: unknown): string | undefined {
  if (isSecretInput(input)) return input.value
  if (typeof input === "string") return input
  return undefined
}
