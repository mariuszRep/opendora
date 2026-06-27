import { describe, expect, test } from "bun:test"
import {
  resolveRef,
  resolveRefs,
  resolveTemplate,
  resolveDeep,
  resolveSchemaDescriptions,
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
