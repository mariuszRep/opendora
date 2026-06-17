import { test, expect, describe } from "bun:test"
import { parseShareUrl, transformShareData, type ShareData, detectFormat, validateCsv, transformCsv } from "../../src/cli/cmd/import"

// parseShareUrl tests
test("parses valid share URLs", () => {
  expect(parseShareUrl("https://opncd.ai/share/Jsj3hNIW")).toBe("Jsj3hNIW")
  expect(parseShareUrl("https://custom.example.com/share/abc123")).toBe("abc123")
  expect(parseShareUrl("http://localhost:3000/share/test_id-123")).toBe("test_id-123")
})

test("rejects invalid URLs", () => {
  expect(parseShareUrl("https://opncd.ai/s/Jsj3hNIW")).toBeNull() // legacy format
  expect(parseShareUrl("https://opncd.ai/share/")).toBeNull()
  expect(parseShareUrl("https://opncd.ai/share/id/extra")).toBeNull()
  expect(parseShareUrl("not-a-url")).toBeNull()
})

// transformShareData tests
test("transforms share data to storage format", () => {
  const data: ShareData[] = [
    { type: "session", data: { id: "sess-1", title: "Test" } as any },
    { type: "message", data: { id: "msg-1", sessionID: "sess-1" } as any },
    { type: "part", data: { id: "part-1", messageID: "msg-1" } as any },
    { type: "part", data: { id: "part-2", messageID: "msg-1" } as any },
  ]

  const result = transformShareData(data)!

  expect(result.info.id).toBe("sess-1")
  expect(result.messages).toHaveLength(1)
  expect(result.messages[0]!.parts).toHaveLength(2)
})

test("returns null for invalid share data", () => {
  expect(transformShareData([])).toBeNull()
  expect(transformShareData([{ type: "message", data: {} as any }])).toBeNull()
  expect(transformShareData([{ type: "session", data: { id: "s" } as any }])).toBeNull() // no messages
})

// detectFormat tests
describe("detectFormat", () => {
  test("detects URL format for http URLs", () => {
    expect(detectFormat("http://example.com/share/abc")).toBe("url")
  })

  test("detects URL format for https URLs", () => {
    expect(detectFormat("https://example.com/share/abc")).toBe("url")
  })

  test("detects CSV format for .csv extension", () => {
    expect(detectFormat("data.csv")).toBe("csv")
    expect(detectFormat("/path/to/file.csv")).toBe("csv")
  })

  test("detects JSON format for other files", () => {
    expect(detectFormat("data.json")).toBe("json")
    expect(detectFormat("data.txt")).toBe("json")
    expect(detectFormat("/path/to/data")).toBe("json")
  })
})

// validateCsv tests
describe("validateCsv", () => {
  test("validates a well-formed CSV", () => {
    const csv = "id,role,content\nmsg-1,user,Hello world\nmsg-2,assistant,Hi there"
    const result = validateCsv(csv)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.rowCount).toBe(2)
  })

  test("rejects CSV without required columns", () => {
    const csv = "name,value\nfoo,bar"
    const result = validateCsv(csv)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("'id'"))).toBe(true)
    expect(result.errors.some((e) => e.includes("'role'"))).toBe(true)
    expect(result.errors.some((e) => e.includes("'content'"))).toBe(true)
  })

  test("rejects CSV with only header", () => {
    const csv = "id,role,content"
    const result = validateCsv(csv)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("at least a header row"))).toBe(true)
  })

  test("warns about duplicate IDs in CSV", () => {
    const csv = "id,role,content\nmsg-1,user,Hello\nmsg-1,user,Duplicate\nmsg-2,assistant,World"
    const result = validateCsv(csv)
    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.includes("duplicate"))).toBe(true)
  })

  test("rejects invalid role values", () => {
    const csv = "id,role,content\nmsg-1,invalid,Hello"
    const result = validateCsv(csv)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("invalid role"))).toBe(true)
  })

  test("accepts valid role values", () => {
    const csv = "id,role,content\nmsg-1,user,Hello\nmsg-2,assistant,Hi\nmsg-3,system,System\nmsg-4,tool,Tool"
    const result = validateCsv(csv)
    expect(result.valid).toBe(true)
  })

  test("handles empty lines in CSV", () => {
    const csv = "id,role,content\nmsg-1,user,Hello\n\nmsg-2,assistant,World\n"
    const result = validateCsv(csv)
    expect(result.valid).toBe(true)
    expect(result.rowCount).toBe(2)
  })

  test("handles quoted fields with newlines", () => {
    const csv = 'id,role,content\nmsg-1,user,"Hello\nWorld"'
    const result = validateCsv(csv)
    // Quoted newlines should be handled as part of the field
    expect(result.valid).toBe(true)
  })

  test("handles trailing empty columns", () => {
    const csv = "id,role,content,extra\nmsg-1,user,Hello,world"
    const result = validateCsv(csv)
    expect(result.valid).toBe(true)
    expect(result.headers).toContain("extra")
  })

  test("normalizes role values to lowercase", () => {
    const csv = "id,role,content\nmsg-1,USER,Hello"
    const result = validateCsv(csv)
    // Role values are normalized to lowercase before validation
    expect(result.valid).toBe(true)
  })
})

// transformCsv tests
describe("transformCsv", () => {
  test("transforms valid CSV to session data", () => {
    const csv = "id,role,content\nmsg-1,user,Hello\nmsg-2,assistant,Hi"
    const result = transformCsv(csv, "session-1", "project-1")

    expect(result.info.id).toBe("session-1")
    expect(result.info.projectID).toBe("project-1")
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0]!.info.id).toBe("msg-1")
    expect(result.messages[0]!.info.role).toBe("user")
    expect((result.messages[0]!.info as any).content).toBe("Hello")
    expect(result.messages[1]!.info.id).toBe("msg-2")
    expect(result.messages[1]!.info.role).toBe("assistant")
  })

  test("handles quoted CSV content with commas", () => {
    const csv = 'id,role,content\nmsg-1,user,"Hello, world"'
    const result = transformCsv(csv, "session-1")

    expect((result.messages[0]!.info as any).content).toBe("Hello, world")
  })

  test("handles empty content", () => {
    const csv = "id,role,content\nmsg-1,user,"
    const result = transformCsv(csv, "session-1")

    expect((result.messages[0]!.info as any).content).toBe("")
  })

  test("handles extra columns including part_id and part_type", () => {
    const csv = "id,role,content,name,part_id,part_type\nmsg-1,user,Hello,tool1,part-1,text"
    const result = transformCsv(csv, "session-1")

    expect(result.messages).toHaveLength(1)
  })

  test("generates message IDs when not provided", () => {
    const csv = "role,content\nuser,Hello\nassistant,Hi"
    const result = transformCsv(csv, "session-1")

    expect(result.messages[0]!.info.id).toMatch(/^msg-/)
    expect(result.messages[1]!.info.id).toMatch(/^msg-/)
    expect(result.messages[0]!.info.id).not.toBe(result.messages[1]!.info.id)
  })

  test("uses provided session ID in message sessionID field", () => {
    const csv = "id,role,content\nmsg-1,user,Hello"
    const result = transformCsv(csv, "my-session-id", "my-project-id")

    expect(result.messages[0]!.info.sessionID).toBe("my-session-id")
  })

  test("sets default title for imported session", () => {
    const csv = "id,role,content\nmsg-1,user,Hello\nmsg-2,assistant,Hi"
    const result = transformCsv(csv, "session-1")

    expect(result.info.title).toContain("2 messages")
  })
})
