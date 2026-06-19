import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import * as fs from "fs/promises"
import {
  findProjectFlowsDir,
  resolveMemoryPath,
  readMemoryFile,
  writeMemoryFile,
  type MemoryEntry,
} from "@opendora/tools/memory/lib"
import { errors } from "../error"
import { lazy } from "@opendora/util/lazy"

const MemoryEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.string(),
  content: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

const DirectoryQuery = z.object({
  directory: z.string().describe("Absolute path to the project root"),
  scope: z.enum(["global", "local"]).default("global"),
  agentID: z.string().optional(),
})

async function resolveMemoryEntries(directory: string, scope: "global" | "local", agentID?: string) {
  const pfDir = await findProjectFlowsDir(directory)
  const memPath = resolveMemoryPath(pfDir, scope, agentID ?? "")
  const entries = await readMemoryFile(memPath)
  return { pfDir, memPath, entries }
}

export const MemoryRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List memory entries",
        operationId: "memory.list",
        responses: {
          200: {
            description: "Array of memory entries",
            content: { "application/json": { schema: resolver(MemoryEntrySchema.array()) } },
          },
          ...errors(400, 404),
        },
      }),
      validator("query", DirectoryQuery),
      async (c) => {
        const { directory, scope, agentID } = c.req.valid("query")
        const pfDir = await findProjectFlowsDir(directory).catch(() => null)
        if (!pfDir) return c.json({ error: "No .projectflows directory found" }, 404)
        const memPath = resolveMemoryPath(pfDir, scope, agentID ?? "")
        const entries = await readMemoryFile(memPath)
        return c.json(entries)
      },
    )
    .get(
      "/:name",
      describeRoute({
        summary: "Get a memory entry by name",
        operationId: "memory.get",
        responses: {
          200: {
            description: "Memory entry",
            content: { "application/json": { schema: resolver(MemoryEntrySchema) } },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ name: z.string() })),
      validator("query", DirectoryQuery),
      async (c) => {
        const { name } = c.req.valid("param")
        const { directory, scope, agentID } = c.req.valid("query")
        const pfDir = await findProjectFlowsDir(directory).catch(() => null)
        if (!pfDir) return c.json({ error: "No .projectflows directory found" }, 404)
        const memPath = resolveMemoryPath(pfDir, scope, agentID ?? "")
        const entries = await readMemoryFile(memPath)
        const entry = entries.find(e => e.name === name)
        if (!entry) return c.json({ error: "Memory entry not found" }, 404)
        return c.json(entry)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create a memory entry",
        operationId: "memory.create",
        responses: {
          201: {
            description: "Created entry",
            content: { "application/json": { schema: resolver(MemoryEntrySchema) } },
          },
          ...errors(400, 404),
        },
      }),
      validator("json", z.object({
        directory: z.string(),
        name: z.string(),
        description: z.string(),
        type: z.string(),
        content: z.string(),
        scope: z.enum(["global", "local"]).default("global"),
        agentID: z.string().optional(),
      })),
      async (c) => {
        const { directory, name, description, type, content, scope, agentID } = c.req.valid("json")
        const pfDir = await findProjectFlowsDir(directory).catch(() => null)
        if (!pfDir) return c.json({ error: "No .projectflows directory found" }, 404)
        const memPath = resolveMemoryPath(pfDir, scope, agentID ?? "")
        const entries = await readMemoryFile(memPath)

        const now = Date.now()
        const idx = entries.findIndex(e => e.name === name)
        const entry: MemoryEntry = {
          name, description, type, content,
          createdAt: idx >= 0 ? (entries[idx]!.createdAt ?? now) : now,
          updatedAt: now,
        }
        if (idx >= 0) {
          entries[idx] = entry
        } else {
          entries.push(entry)
        }
        await writeMemoryFile(memPath, entries)
        return c.json(entry, 201)
      },
    )
    .put(
      "/:name",
      describeRoute({
        summary: "Update a memory entry",
        operationId: "memory.update",
        responses: {
          200: {
            description: "Updated entry",
            content: { "application/json": { schema: resolver(MemoryEntrySchema) } },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ name: z.string() })),
      validator("json", z.object({
        directory: z.string(),
        scope: z.enum(["global", "local"]).default("global"),
        agentID: z.string().optional(),
        description: z.string().optional(),
        type: z.string().optional(),
        content: z.string().optional(),
      })),
      async (c) => {
        const { name } = c.req.valid("param")
        const { directory, scope, agentID, ...updates } = c.req.valid("json")
        const pfDir = await findProjectFlowsDir(directory).catch(() => null)
        if (!pfDir) return c.json({ error: "No .projectflows directory found" }, 404)
        const memPath = resolveMemoryPath(pfDir, scope, agentID ?? "")
        const entries = await readMemoryFile(memPath)
        const idx = entries.findIndex(e => e.name === name)
        if (idx < 0) return c.json({ error: "Memory entry not found" }, 404)
        const entry: MemoryEntry = { ...entries[idx]!, ...updates, updatedAt: Date.now() }
        entries[idx] = entry
        await writeMemoryFile(memPath, entries)
        return c.json(entry)
      },
    )
    .delete(
      "/:name",
      describeRoute({
        summary: "Delete a memory entry",
        operationId: "memory.delete",
        responses: {
          204: { description: "Deleted or already absent" },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ name: z.string() })),
      validator("query", DirectoryQuery),
      async (c) => {
        const { name } = c.req.valid("param")
        const { directory, scope, agentID } = c.req.valid("query")
        const pfDir = await findProjectFlowsDir(directory).catch(() => null)
        if (!pfDir) return c.json({ error: "No .projectflows directory found" }, 404)
        const memPath = resolveMemoryPath(pfDir, scope, agentID ?? "")
        const entries = await readMemoryFile(memPath)
        const idx = entries.findIndex(e => e.name === name)
        if (idx >= 0) {
          entries.splice(idx, 1)
          if (entries.length === 0) {
            await fs.unlink(memPath).catch(() => {})
          } else {
            await writeMemoryFile(memPath, entries)
          }
        }
        return c.body(null, 204)
      },
    ),
)
