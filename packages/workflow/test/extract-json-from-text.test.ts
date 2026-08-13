import { test, expect } from "bun:test"
import { extractJsonFromText } from "../src/runner"

test("parses plain JSON", () => {
  expect(extractJsonFromText('{"status":"done"}')).toEqual({ status: "done" })
})

test("parses JSON inside a fenced code block", () => {
  const text = 'Here you go:\n```json\n{"status":"done"}\n```\nHope that helps.'
  expect(extractJsonFromText(text)).toEqual({ status: "done" })
})

test("reconstructs args from DSML-style hallucinated tool-call text", () => {
  const text = [
    '<｜｜DSML｜｜tool_calls> <｜｜DSML｜｜invoke name="workflow_structured">',
    '<｜｜DSML｜｜parameter name="decisions" string="false">',
    '[{"story_id": "abc123", "decision": "confirm", "rejected_member_id": null, "rationale": "same event"}]',
    "</｜｜DSML｜｜parameter> </｜｜DSML｜｜invoke> </｜｜DSML｜｜tool_calls>",
  ].join("\n")

  expect(extractJsonFromText(text)).toEqual({
    decisions: [{ story_id: "abc123", decision: "confirm", rejected_member_id: null, rationale: "same event" }],
  })
})

test("reconstructs multiple DSML parameters into one object", () => {
  const text =
    '<parameter name="status">"done"</parameter><parameter name="count">3</parameter>'
  expect(extractJsonFromText(text)).toEqual({ status: "done", count: 3 })
})

test("falls back to the raw string when a DSML parameter value isn't valid JSON", () => {
  const text = '<parameter name="summary">plain prose, not JSON</parameter>'
  expect(extractJsonFromText(text)).toEqual({ summary: "plain prose, not JSON" })
})

test("returns undefined for text with no extractable JSON", () => {
  expect(extractJsonFromText("just some prose with no structure at all")).toBeUndefined()
})
