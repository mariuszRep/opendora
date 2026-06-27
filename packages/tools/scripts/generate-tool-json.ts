#!/usr/bin/env bun
/**
 * Generates tool.json files for a tool group.
 *
 * Usage:
 *   bun packages/tools/scripts/generate-tool-json.ts <group-dir>
 *
 * Example:
 *   bun packages/tools/scripts/generate-tool-json.ts packages/tools/filesystem
 *
 * For each tool in the group index, it:
 *   1. Calls tool.init() to get the live Zod schema and description
 *   2. Converts the Zod schema to JSON Schema (MCP inputSchema format)
 *   3. Reads the existing .txt description file if present (takes precedence)
 *   4. Writes <tool-name>.json next to the tool file
 *
 * After running, review each generated JSON and edit descriptions as needed,
 * then update the tool's .ts file to import from the JSON instead of the .txt.
 */

import { zodToJsonSchema } from "zod-to-json-schema"
import fs from "fs/promises"
import path from "path"

const groupDir = process.argv[2]
if (!groupDir) {
  console.error("Usage: generate-tool-json.ts <group-dir>")
  process.exit(1)
}

const absGroupDir = path.resolve(groupDir)
const indexPath = path.join(absGroupDir, "index.ts")

console.log(`\nGenerating tool.json files for: ${absGroupDir}\n`)

const indexContent = await fs.readFile(indexPath, "utf-8")

// Extract exported names and their source files from index.ts
const exportPattern = /export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g
const tools: Array<{ exportName: string; sourceFile: string }> = []

for (const match of indexContent.matchAll(exportPattern)) {
  const names = match[1]!.split(",").map((n) => n.trim()).filter(Boolean)
  const sourceFile = match[2]!.replace(/\.ts$/, "")
  for (const name of names) {
    tools.push({ exportName: name, sourceFile })
  }
}

if (tools.length === 0) {
  console.error("No exports found in index.ts")
  process.exit(1)
}

console.log(`Found ${tools.length} tool export(s): ${tools.map((t) => t.exportName).join(", ")}\n`)

for (const { exportName, sourceFile } of tools) {
  const modulePath = path.join(absGroupDir, sourceFile)

  let mod: any
  try {
    mod = await import(modulePath)
  } catch (e) {
    console.warn(`  ⚠  Could not import ${modulePath}: ${e}`)
    continue
  }

  const tool = mod[exportName]
  if (!tool || typeof tool.init !== "function") {
    console.warn(`  ⚠  ${exportName} is not a Tool.Info (no init function)`)
    continue
  }

  let toolInfo: any
  try {
    toolInfo = await tool.init(undefined)
  } catch (e) {
    console.warn(`  ⚠  ${exportName}.init() failed: ${e}`)
    continue
  }

  // Convert Zod schema → JSON Schema
  let inputSchema: any
  try {
    inputSchema = zodToJsonSchema(toolInfo.parameters, { target: "jsonSchema7" })
    // Remove the $schema field — not needed in MCP inputSchema
    delete inputSchema.$schema
  } catch (e) {
    console.warn(`  ⚠  Could not convert schema for ${exportName}: ${e}`)
    inputSchema = { type: "object", properties: {} }
  }

  // Check for existing .txt description file (takes precedence over init() description)
  const txtPath = path.join(absGroupDir, `${sourceFile}.txt`)
  let description = toolInfo.description as string
  try {
    const txtContent = await fs.readFile(txtPath, "utf-8")
    description = txtContent.trim()
    console.log(`  ✓  ${exportName} — using description from ${path.basename(txtPath)}`)
  } catch {
    console.log(`  ✓  ${exportName} — using description from tool.init()`)
  }

  const toolJson = {
    name: tool.id,
    description,
    inputSchema,
  }

  const outPath = path.join(absGroupDir, `${sourceFile}.json`)

  // Skip if a .json already exists — don't overwrite hand-edited files
  try {
    await fs.access(outPath)
    console.log(`  ⏭  ${path.basename(outPath)} already exists — skipping`)
    continue
  } catch {
    // file doesn't exist, proceed
  }

  await fs.writeFile(outPath, JSON.stringify(toolJson, null, 2) + "\n")
  console.log(`  ✍  Written: ${path.basename(outPath)}`)
}

console.log("\nDone. Review the generated JSON files and edit descriptions as needed.")
console.log("Then update each tool's .ts file to import from its .json instead of .txt.\n")
