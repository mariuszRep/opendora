import { z } from "zod"
import { readFile, readdir } from "fs/promises"
import { join } from "path"

export const ToolGroupConfigFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "password", "boolean", "path"]),
  description: z.string().optional(),
  placeholder: z.string().optional(),
})

export const ToolGroupManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  sourceGroup: z.string().optional(),
  config: z.object({ fields: z.array(ToolGroupConfigFieldSchema) }).optional(),
  runtime: z
    .object({
      env: z.array(z.string()).optional(),
      secrets: z.array(z.string()).optional(),
    })
    .optional(),
  tools: z.array(z.string()),
  mcp: z.object({ serverName: z.string().optional() }).optional(),
})

export type ToolGroupConfigField = z.infer<typeof ToolGroupConfigFieldSchema>
export type ToolGroupManifest = z.infer<typeof ToolGroupManifestSchema>

export type ToolGroupId =
  | "filesystem"
  | "shell"
  | "web"
  | "browser"
  | "desktop"
  | "automation"
  | "sessions"
  | "memory"
  | "agents"
  | "skills"
  | "workflows"
  | "schedule"
  | "communication"
  | "system"
  | "tool-registry"
  | "others"

export async function loadGroupManifest(manifestPath: string): Promise<ToolGroupManifest> {
  const raw = await readFile(manifestPath, "utf-8")
  return ToolGroupManifestSchema.parse(JSON.parse(raw))
}

export async function loadGroupManifests(toolsRootDir: string): Promise<ToolGroupManifest[]> {
  const entries = await readdir(toolsRootDir, { withFileTypes: true }).catch(() => [])
  const results: ToolGroupManifest[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      results.push(await loadGroupManifest(join(toolsRootDir, entry.name, "group.json")))
    } catch {
      // skip dirs without group.json or invalid manifests
    }
  }
  return results
}

export function resolveToolGroup(toolId: string, manifests: ToolGroupManifest[]): string | undefined {
  for (const m of manifests) {
    if (m.tools.includes(toolId)) return m.id
  }
  return undefined
}

export function resolveManifestForGroup(groupId: string, manifests: ToolGroupManifest[]): ToolGroupManifest | undefined {
  return manifests.find((m) => m.id === groupId)
}

export const GROUP_DIR_FOR_ID: Record<string, string> = {
  filesystem: "filesystem",
  shell: "shell",
  web: "web",
  browser: "browser",
  desktop: "desktop",
  automation: "automation",
  sessions: "sessions",
  memory: "memory",
  agents: "agents",
  skills: "skills",
  workflows: "workflows",
  schedule: "schedule",
  communication: "communication",
  system: "system",
}
