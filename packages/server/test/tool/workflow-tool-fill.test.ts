import { describe, expect, test } from "bun:test"
import z from "zod"
import { mergeArgs, formatValidationFeedback, toJsonSchema } from "../../src/workflow-tool-fill"

describe("workflow-tool-fill.mergeArgs", () => {
  test("agent-generated values are used when no fixed value overlaps", () => {
    const merged = mergeArgs({ a: 1, b: "two" }, {})
    expect(merged).toEqual({ a: 1, b: "two" })
  })

  test("fixed (configured) args always win over agent-generated values for the same key", () => {
    const merged = mergeArgs({ questions: "wrong", other: "agent-value" }, { questions: ["real"] })
    expect(merged).toEqual({ questions: ["real"], other: "agent-value" })
  })

  test("arrays and objects from fixed args are preserved as their real type, not stringified", () => {
    const fixed = { options: [{ label: "a" }, { label: "b" }] }
    const merged = mergeArgs({}, fixed)
    expect(Array.isArray(merged.options)).toBe(true)
    expect(merged.options).toEqual(fixed.options)
  })
})

describe("workflow-tool-fill.formatValidationFeedback", () => {
  const schema = z.object({ questions: z.array(z.string()).min(1) })

  test("produces field-level, actionable feedback naming the tool and the failing path", () => {
    const result = schema.safeParse({ questions: [] })
    expect(result.success).toBe(false)
    if (result.success) return
    const message = formatValidationFeedback("question", {}, result.error, { questions: [] })
    expect(message).toContain("`question`")
    expect(message).toContain("questions")
    expect(message).toContain("Previous value")
  })

  test("prefers the tool's own formatValidationError when it declares one", () => {
    const result = schema.safeParse({})
    expect(result.success).toBe(false)
    if (result.success) return
    const message = formatValidationFeedback(
      "custom-tool",
      { formatValidationError: () => "custom formatted error" },
      result.error,
      {},
    )
    expect(message).toBe("custom formatted error")
  })

  test("falls back to the generic formatter if the tool's own formatter throws", () => {
    const result = schema.safeParse({})
    expect(result.success).toBe(false)
    if (result.success) return
    const message = formatValidationFeedback(
      "custom-tool",
      {
        formatValidationError: () => {
          throw new Error("boom")
        },
      },
      result.error,
      {},
    )
    expect(message).toContain("`custom-tool`")
  })
})

describe("workflow-tool-fill.toJsonSchema", () => {
  test("derives a provider-facing JSON Schema from a Zod schema", () => {
    const schema = z.object({ questions: z.array(z.string()) })
    const jsonSchema = toJsonSchema(schema) as any
    expect(jsonSchema.type).toBe("object")
    expect(jsonSchema.properties?.questions).toBeDefined()
  })
})
