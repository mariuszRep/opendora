import { describe, expect, test } from "bun:test"
import {
  resolveRef,
  resolveRefs,
  resolveTemplate,
  resolveDeep,
  resolveSchemaDescriptions,
  describeCtxManifest,
  getAvailableRefs,
  tokenStart,
  partialToken,
  REF_PATTERN,
} from "./refs.ts"

describe("reference resolution", () => {
  const input = { color: "red", count: 42 }
  const ctx = { summary: "hello world", parsed: { hue: "blue" } }

  test("resolves legacy $input.x", () => {
    expect(resolveRef("$input.color", input, ctx)).toBe("red")
  })

  test("resolves legacy $ctx.x", () => {
    expect(resolveRef("$ctx.summary", input, ctx)).toBe("hello world")
  })

  test("resolves legacy $output.x", () => {
    const ctxWithOutput = { ...ctx, result: "done" }
    expect(resolveRef("$output.result", input, ctxWithOutput)).toBe("done")
  })

  test("resolves new $nodeKey", () => {
    expect(resolveRef("$parsed", input, ctx)).toEqual({ hue: "blue" })
  })

  test("resolves new $nodeKey.field", () => {
    expect(resolveRef("$parsed.hue", input, ctx)).toBe("blue")
  })

  test("resolves $input without path", () => {
    expect(resolveRef("$input", input, ctx)).toEqual(input)
  })

  test("substitutes templates", () => {
    expect(resolveTemplate("Color: $input.color, Summary: $ctx.summary", input, ctx)).toBe(
      "Color: red, Summary: hello world",
    )
  })

  test("does not consume sentence punctuation after legacy references", () => {
    expect(resolveTemplate("Summary: $ctx.summary. Color: $input.color,", input, ctx)).toBe(
      "Summary: hello world. Color: red,",
    )
  })

  test("does not consume sentence punctuation after node references", () => {
    expect(resolveTemplate("Parsed hue: $parsed.hue.", input, ctx)).toBe(
      "Parsed hue: blue.",
    )
  })

  test("resolveRefs resolves a record of args", () => {
    expect(resolveRefs({ a: "$input.color", b: "$ctx.summary" }, input, ctx)).toEqual({
      a: "red",
      b: "hello world",
    })
  })

  test("resolveDeep resolves nested structures", () => {
    expect(resolveDeep({ a: "$input.color", b: ["$ctx.summary"] }, input, ctx)).toEqual({
      a: "red",
      b: ["hello world"],
    })
  })

  test("resolveDeep preserves arrays — does not flatten to [object Object]", () => {
    const questions = [
      { question: "What is your name?", options: ["Alice", "Bob"] },
      { question: "Favorite color?", options: "$input.color" },
    ]
    const result = resolveDeep({ questions }, input, ctx) as { questions: Array<Record<string, unknown>> }
    // Must stay an array of objects, not a stringified mess
    expect(Array.isArray(result.questions)).toBe(true)
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0]!).toEqual({ question: "What is your name?", options: ["Alice", "Bob"] })
    // $ref inside nested object should resolve
    expect(result.questions[1]!).toEqual({ question: "Favorite color?", options: "red" })
  })

  test("resolveDeep resolves refs inside nested arrays", () => {
    const ctxWithOpts = { ...ctx, dedupe_payload: { question_options: ["Yes", "No", "Maybe"] } }
    const params = {
      title: "Confirm",
      questions: [
        { question: "Proceed?", options: "$dedupe_payload.question_options" },
      ],
    }
    const result = resolveDeep(params, input, ctxWithOpts) as { questions: Array<Record<string, unknown>> }
    expect(result.questions[0]!.options).toEqual(["Yes", "No", "Maybe"])
  })

  test("resolveDeep handles mixed flat + nested params (backward compat)", () => {
    const params = {
      prompt: "Color is $input.color",
      count: 42,
      items: ["$input.color", "$ctx.summary"],
    }
    const result = resolveDeep(params, input, ctx) as { prompt: string; count: number; items: string[] }
    expect(result.prompt).toBe("Color is red")
    expect(result.count).toBe(42)
    expect(result.items).toEqual(["red", "hello world"])
  })

  test("resolveSchemaDescriptions resolves only description/title strings", () => {
    const schema = {
      type: "object",
      description: "Schema for $input.color",
      properties: {
        hue: {
          type: "string",
          description: "Hue is $ctx.summary",
          enum: ["$input.color"],
        },
      },
      required: ["hue"],
    }
    expect(resolveSchemaDescriptions(schema, input, ctx)).toEqual({
      type: "object",
      description: "Schema for red",
      properties: {
        hue: {
          type: "string",
          description: "Hue is hello world",
          enum: ["$input.color"],
        },
      },
      required: ["hue"],
    })
  })
})

describe("token helpers", () => {
  test("tokenStart finds $ at start of reference", () => {
    expect(tokenStart("prefix $input.color", 18)).toBe(7)
  })

  test("tokenStart returns -1 after whitespace", () => {
    expect(tokenStart("prefix $input.color", 6)).toBe(-1)
  })

  test("REF_PATTERN matches references", () => {
    const matches = "Use $input.color and $node_key.field".match(REF_PATTERN)
    expect(matches).toEqual(["$input.color", "$node_key.field"])
  })

  test("partialToken extracts in-progress reference", () => {
    expect(partialToken("Use $input.color", 11)).toBe("$input.")
  })
})

describe("getAvailableRefs", () => {
  const nodes = [
    {
      id: "n1",
      data: {
        nodeType: "parameters",
        node: { label: "Inputs" },
        workflowParameters: [{ name: "color", description: "Favorite color" }],
      },
    },
    {
      id: "n2",
      data: {
        nodeType: "structured",
        node: { label: "Parse", key: "parsed" },
        outputSchema: {
          type: "object",
          properties: { hue: { description: "Color hue", type: "string" } },
        },
      },
    },
    {
      id: "n3",
      data: {
        nodeType: "prompt",
        node: { label: "Greet", key: "greet" },
      },
    },
  ]

  test("includes $input refs from parameters node", () => {
    const refs = getAvailableRefs("n3", nodes, [{ source: "n1", target: "n3" }])
    expect(refs).toContainEqual({ ref: "$input.color", source: "Inputs", description: "Favorite color" })
  })

  test("includes $nodeKey and $nodeKey.field for structured nodes", () => {
    const refs = getAvailableRefs("n3", nodes, [{ source: "n2", target: "n3" }])
    expect(refs).toContainEqual({ ref: "$parsed", source: "Parse", description: "full output" })
    expect(refs).toContainEqual({ ref: "$parsed.hue", source: "Parse", description: "Color hue" })
  })

  test("only includes upstream nodes", () => {
    const refs = getAvailableRefs("n3", nodes, [{ source: "n3", target: "n1" }])
    expect(refs).toHaveLength(0)
  })
})

describe("resolveTemplate pointer mode", () => {
  const input = { color: "red" }
  const ctx = { summary: "the full summary text", parsed: { hue: "blue" } }

  test("value mode (default) inlines the full value — unchanged behavior", () => {
    expect(resolveTemplate("S: $ctx.summary", input, ctx)).toBe("S: the full summary text")
    expect(resolveTemplate("S: $ctx.summary", input, ctx, { mode: "value" })).toBe(
      "S: the full summary text",
    )
  })

  test("pointer mode renders a compact citation instead of the value for present keys", () => {
    const presentKeys = new Set(["summary"])
    const out = resolveTemplate("Use this: $ctx.summary", input, ctx, { mode: "pointer", presentKeys })
    expect(out).not.toContain("the full summary text")
    expect(out).toContain("summary")
  })

  test("pointer mode falls back to full value when key is absent from presentKeys", () => {
    const presentKeys = new Set<string>() // e.g. hydrated from a checkpoint on resume
    expect(resolveTemplate("Use: $ctx.summary", input, ctx, { mode: "pointer", presentKeys })).toBe(
      "Use: the full summary text",
    )
  })

  test("pointer mode covers $nodeKey and $nodeKey.field", () => {
    const presentKeys = new Set(["parsed"])
    const full = resolveTemplate("Hue: $parsed.hue", input, ctx, { mode: "pointer", presentKeys })
    expect(full).not.toContain("blue")
    expect(full).toContain("parsed")
  })

  test("pointer mode never applies to $input refs — inputs stay full value", () => {
    const presentKeys = new Set(["color"]) // even if a same-named key were present
    expect(resolveTemplate("C: $input.color", input, ctx, { mode: "pointer", presentKeys })).toBe(
      "C: red",
    )
  })

  test("custom renderPointer is used when provided", () => {
    const presentKeys = new Set(["summary"])
    const out = resolveTemplate("$ctx.summary", input, ctx, {
      mode: "pointer",
      presentKeys,
      renderPointer: (key) => `<<${key}>>`,
    })
    expect(out).toBe("<<summary>>")
  })
})

describe("describeCtxManifest", () => {
  test("names each key with a type/shape hint and no full values", () => {
    const manifest = describeCtxManifest({
      summary: "hello world",
      article: { title: "T", body: "B", url: "U" },
      items: [1, 2, 3],
      count: 7,
      done: true,
    })
    expect(manifest).toContain("- summary: string (11 chars)")
    expect(manifest).toContain("- article: object { title, body, url }")
    expect(manifest).toContain("- items: array[3]")
    expect(manifest).toContain("- count: number")
    expect(manifest).toContain("- done: boolean")
    // the actual string value must not leak
    expect(manifest).not.toContain("hello world")
  })
})
