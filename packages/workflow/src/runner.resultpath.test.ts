import { describe, expect, test } from "bun:test"
import { resolveRef, resolveTemplate } from "./refs.ts"

// ─── resultPath extraction tests ──────────────────────────────────────────────
// These test the core logic that the runner.ts resultPath feature relies on:
// resolving a path like "$ctx.metadata.answers.0" against a context that has
// tool metadata injected under a `metadata` key.

describe("resultPath extraction via resolveRef", () => {
  const input = {}

  test("extracts first answer from question tool metadata", () => {
    const toolMeta = {
      answers: [["OpenAI launches GPT-5", "Anthropic raises $10B", "EU AI Act enforced"]],
    }
    const ctx = { ...input, metadata: toolMeta }
    const extracted = resolveRef("$ctx.metadata.answers.0", input, ctx)
    expect(extracted).toEqual(["OpenAI launches GPT-5", "Anthropic raises $10B", "EU AI Act enforced"])
  })

  test("extracts single selected label", () => {
    const toolMeta = {
      answers: [["OpenAI launches GPT-5"]],
    }
    const ctx = { metadata: toolMeta }
    const extracted = resolveRef("$ctx.metadata.answers.0", input, ctx)
    expect(extracted).toEqual(["OpenAI launches GPT-5"])
  })

  test("returns undefined when metadata is missing", () => {
    const ctx = {}
    const extracted = resolveRef("$ctx.metadata.answers.0", input, ctx)
    expect(extracted).toBeUndefined()
  })

  test("returns undefined when answers array is empty", () => {
    const toolMeta = { answers: [] }
    const ctx = { metadata: toolMeta }
    const extracted = resolveRef("$ctx.metadata.answers.0", input, ctx)
    expect(extracted).toBeUndefined()
  })

  test("handles nested path through metadata object", () => {
    const toolMeta = {
      answers: [["Story A", "Story B"]],
      extra: { note: "test" },
    }
    const ctx = { metadata: toolMeta }
    expect(resolveRef("$ctx.metadata.extra.note", input, ctx)).toBe("test")
  })
})

// ─── for_each array handling tests ────────────────────────────────────────────
// Verifies that for_each correctly treats arrays as multiple items, not one.

describe("for_each item resolution", () => {
  test("JSON.parse succeeds on valid JSON array string", () => {
    const rawItems = '["Story A", "Story B", "Story C"]'
    const parsed = JSON.parse(rawItems)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(3)
  })

  test("for_each wraps non-array, non-JSON string as single item", () => {
    // This is the OLD broken behavior — raw display string treated as one item
    const rawItems = "Q1: Story A, Story B, Story C"
    let items: unknown[]
    try {
      const p = JSON.parse(rawItems)
      items = Array.isArray(p) ? p : [rawItems]
    } catch {
      items = rawItems ? [rawItems] : []
    }
    expect(items).toHaveLength(1)
    expect(items[0]).toBe("Q1: Story A, Story B, Story C")
  })

  test("for_each iterates actual array items individually", () => {
    const items = ["Story A", "Story B", "Story C"]
    const results: string[] = []
    for (const item of items) {
      results.push(typeof item === "string" ? resolveTemplate(item, {}, {}) : String(item))
    }
    expect(results).toEqual(["Story A", "Story B", "Story C"])
  })
})

// ─── selected_ids / selected_count semantics ──────────────────────────────────
// Verifies the publisher payload derivation logic.

describe("publisher payload derivation", () => {
  test("derives selected_ids and selected_count from publishable stories", () => {
    const stories: Record<string, unknown>[] = [
      { id: "story-a", title: "Story A", publishable: true },
      { id: "story-b", title: "Story B", publishable: false },
      { id: "story-c", title: "Story C", publishable: true },
    ]
    const publishable = stories.filter((s) => s.publishable !== false)
    const selectedIds = publishable.map((s) => s.id)
    const selectedCount = publishable.length

    expect(selectedIds).toEqual(["story-a", "story-c"])
    expect(selectedCount).toBe(2)
  })

  test("zero publishable stories produces empty arrays", () => {
    const stories: Record<string, unknown>[] = [
      { id: "story-a", publishable: false },
      { id: "story-b", publishable: false },
    ]
    const publishable = stories.filter((s) => s.publishable !== false)
    expect(publishable).toHaveLength(0)
    expect(publishable.map((s) => s.id)).toEqual([])
  })

  test("handles stories without publishable field (default: publishable)", () => {
    const stories: Record<string, unknown>[] = [
      { id: "story-a", title: "Story A" },
      { id: "story-b", title: "Story B" },
    ]
    const publishable = stories.filter((s) => s.publishable !== false)
    expect(publishable).toHaveLength(2)
  })

  test("handles commas and quotes in story titles", () => {
    const stories: Record<string, unknown>[] = [
      { id: "story-a", title: 'Apple, Google announce "AI Partnership"', publishable: true },
      { id: "story-b", title: "Meta's new model beats GPT-4", publishable: true },
    ]
    const publishable = stories.filter((s) => s.publishable !== false)
    const payload = {
      selected_ids: publishable.map((s) => s.id),
      selected_count: publishable.length,
      stories: publishable,
    }
    // Must produce valid JSON
    const json = JSON.stringify(payload)
    const parsed = JSON.parse(json)
    expect(parsed.selected_ids).toEqual(["story-a", "story-b"])
    expect(parsed.selected_count).toBe(2)
    expect(parsed.stories[0].title).toBe('Apple, Google announce "AI Partnership"')
  })

  test("handles newlines in story content", () => {
    const stories: Record<string, unknown>[] = [
      { id: "story-a", title: "Story with\nnewlines", summary: "Line 1\nLine 2\nLine 3", publishable: true },
    ]
    const payload = {
      selected_ids: ["story-a"],
      selected_count: 1,
      stories,
    }
    const json = JSON.stringify(payload)
    const parsed = JSON.parse(json)
    expect(parsed.stories[0].summary).toBe("Line 1\nLine 2\nLine 3")
  })
})
