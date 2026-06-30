/**
 * Regression test: AgentStorage.loadAll() must ONLY return agents backed by a
 * valid agent.json in a subdirectory. Files at the agents root, directories
 * without agent.json, and files inside agent directories (LOG.md, INJECTION.md,
 * PERSONA.md, VISION.md) must never appear as agent entries.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { AgentStorage } from "../src/storage"

const VALID_AGENT_JSON = JSON.stringify({
  name: "Valid Agent",
  description: "A real agent",
  mode: "primary",
  tools: [],
})

let tmpBase: string

beforeAll(async () => {
  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "agent-listing-test-"))
  const agentsRoot = path.join(tmpBase, AgentStorage.PROJECTFLOWS_DIR, AgentStorage.AGENTS_SUBDIR)
  await fs.mkdir(agentsRoot, { recursive: true })

  // 1. A valid agent — has agent.json
  const validDir = path.join(agentsRoot, "valid-agent")
  await fs.mkdir(validDir, { recursive: true })
  await fs.writeFile(path.join(validDir, "agent.json"), VALID_AGENT_JSON)
  await fs.writeFile(path.join(validDir, "LOG.md"), "# log")
  await fs.writeFile(path.join(validDir, "PERSONA.md"), "persona")
  await fs.writeFile(path.join(validDir, "INJECTION.md"), "injection")
  await fs.writeFile(path.join(validDir, "VISION.md"), "vision")

  // 2. A second valid agent
  const valid2Dir = path.join(agentsRoot, "another-agent")
  await fs.mkdir(valid2Dir, { recursive: true })
  await fs.writeFile(path.join(valid2Dir, "agent.json"), JSON.stringify({ name: "Another", mode: "worker", tools: [] }))

  // 3. Orphaned directory — no agent.json (like the real-world "Minds/" dir)
  const orphanDir = path.join(agentsRoot, "Minds")
  await fs.mkdir(orphanDir, { recursive: true })
  await fs.writeFile(path.join(orphanDir, "MEMORY.md"), "# memory")

  // 4. Directory with invalid agent.json (not parseable)
  const brokenDir = path.join(agentsRoot, "broken-agent")
  await fs.mkdir(brokenDir, { recursive: true })
  await fs.writeFile(path.join(brokenDir, "agent.json"), "{ not valid json }")

  // 5. Bare files at the agents root — must never appear as agent entries
  await fs.writeFile(path.join(agentsRoot, "LOG.md"), "# root log")
  await fs.writeFile(path.join(agentsRoot, "MEMORY.md"), "# root memory")
  await fs.writeFile(path.join(agentsRoot, "index.json"), JSON.stringify({ agents: [] }))
})

afterAll(async () => {
  await fs.rm(tmpBase, { recursive: true, force: true })
})

describe("AgentStorage.loadAll", () => {
  test("returns only agents with valid agent.json in a subdirectory", async () => {
    const entries = await AgentStorage.loadAll(tmpBase)
    const ids = entries.map((e) => e.id)

    expect(ids).toContain("valid-agent")
    expect(ids).toContain("another-agent")
    expect(ids).not.toContain("Minds")          // orphaned dir
    expect(ids).not.toContain("broken-agent")   // invalid agent.json
    expect(ids).not.toContain("LOG.md")         // file at root
    expect(ids).not.toContain("MEMORY.md")      // file at root
    expect(ids).not.toContain("index.json")     // file at root
    expect(ids).not.toContain("LOG")            // file inside agent dir
    expect(ids).not.toContain("INJECTION")      // file inside agent dir
    expect(ids).not.toContain("PERSONA")        // file inside agent dir
    expect(entries.length).toBe(2)
  })

  test("agent loaded from filesystem has correct name from agent.json", async () => {
    const entries = await AgentStorage.loadAll(tmpBase)
    const valid = entries.find((e) => e.id === "valid-agent")
    expect(valid).toBeDefined()
    expect(valid!.config.name).toBe("Valid Agent")
  })
})
