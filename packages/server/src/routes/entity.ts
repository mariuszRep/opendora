import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import fs from "fs/promises"
import path from "path"
import { RemoteEntitySource } from "@projectflows/plugin/source"
import { PluginStorage, CapabilityRegistry } from "@projectflows/plugin"
import { Config } from "@projectflows/config/config"
import { lazy } from "@projectflows/util/lazy"
import { ToolRegistry } from "@projectflows/server/tool-registry"

const DEFAULT_REGISTRY_URL = "https://projectflows.ai"

// ToolRegistry only scans the grouped layout: tools/<group>/tools/<name>.{js,ts}
// (see packages/tools/registry.ts). A tool's group isn't known up front, so it
// must be resolved by scanning existing group dirs.
async function findToolFile(root: string, name: string): Promise<string | null> {
  const groupsDir = path.join(root, "tools")
  const groups = await fs.readdir(groupsDir, { withFileTypes: true }).catch(() => [])
  for (const g of groups) {
    if (!g.isDirectory()) continue
    for (const ext of [".js", ".ts"]) {
      const p = path.join(groupsDir, g.name, "tools", `${name}${ext}`)
      if (await fs.access(p).then(() => true).catch(() => false)) return p
    }
  }
  return null
}

function entityDir(type: string, name: string, root: string): string | null {
  switch (type) {
    case "agent":
      return path.join(root, "agents", name)
    case "skill":
      return path.join(root, "skills", name)
    case "workflow":
      return path.join(root, "workflows", name)
    case "tool-group":
      return path.join(root, "tools", name)
    default:
      return null
  }
}

async function isInstalled(type: string, name: string): Promise<boolean> {
  const root = PluginStorage.globalRoot()
  if (type === "tool") return (await findToolFile(root, name)) !== null
  const p = entityDir(type, name, root)
  if (!p) return false
  return fs.access(p).then(() => true).catch(() => false)
}

async function installEntity(
  type: string,
  name: string,
  extractDir: string,
): Promise<void> {
  const root = PluginStorage.globalRoot()

  if (type === "agent" || type === "skill" || type === "workflow") {
    const subdir = type === "agent" ? "agents" : type === "skill" ? "skills" : "workflows"
    const destDir = path.join(root, subdir, name)
    await fs.mkdir(destDir, { recursive: true })
    const entries = await fs.readdir(extractDir, { withFileTypes: true })
    for (const entry of entries) {
      await fs.cp(path.join(extractDir, entry.name), path.join(destDir, entry.name), { recursive: true })
    }
  } else if (type === "tool") {
    // Standalone (groupless) tool download — bucket it into an "others" group so
    // ToolRegistry's tools/<group>/tools/*.js scan actually picks it up.
    const groupDir = path.join(root, "tools", "others")
    const toolsDir = path.join(groupDir, "tools")
    await fs.mkdir(toolsDir, { recursive: true })
    const manifestPath = path.join(groupDir, "group.json")
    if (!(await fs.access(manifestPath).then(() => true).catch(() => false))) {
      const stub = { id: "others", name: "others", description: "", icon: "Wrench", tools: [], sourceGroup: "" }
      await fs.writeFile(manifestPath, JSON.stringify(stub, null, 2), "utf-8")
    }
    const src = path.join(extractDir, `${name}.js`)
    const dest = path.join(toolsDir, `${name}.js`)
    await fs.copyFile(src, dest)
  } else if (type === "tool-group") {
    const destDir = path.join(root, "tools", name)
    await fs.mkdir(destDir, { recursive: true })
    const entries = await fs.readdir(extractDir, { withFileTypes: true })
    for (const entry of entries) {
      await fs.cp(path.join(extractDir, entry.name), path.join(destDir, entry.name), { recursive: true })
    }
  }
}

export const EntityRoutes = lazy(() =>
  new Hono()
    .get(
      "/available",
      describeRoute({
        summary: "List entities available in the remote registry, with installed status merged in",
        operationId: "entity.available",
        responses: {
          200: { description: "Available entities with installed status" },
        },
      }),
      async (c) => {
        const cfg = await Config.get()
        const registryUrl = cfg.registry?.url ?? DEFAULT_REGISTRY_URL
        const { searchParams } = new URL(c.req.url)
        const type = searchParams.get("type") ?? undefined
        const q = searchParams.get("q") ?? undefined

        const remote = await RemoteEntitySource.list(registryUrl, { type, q })
        const withStatus = await Promise.all(
          remote.map(async (e) => ({
            ...e,
            installed: await isInstalled(e.type, e.id),
          })),
        )
        return c.json(withStatus)
      },
    )
    .post(
      "/install-remote",
      describeRoute({
        summary: "Download and install an entity from the remote registry",
        operationId: "entity.installRemote",
        responses: {
          201: { description: "Entity installed" },
          400: { description: "Bad request" },
          404: { description: "Entity not found in registry" },
        },
      }),
      async (c) => {
        const body = await c.req.json<{ type: string; name: string }>()
        if (!body.type || !body.name) {
          return c.json({ message: "type and name are required" }, 400)
        }

        const cfg = await Config.get()
        const registryUrl = cfg.registry?.url ?? DEFAULT_REGISTRY_URL

        const entity = await RemoteEntitySource.get(registryUrl, body.type, body.name)
        if (!entity) {
          return c.json({ message: `Entity not found in registry: ${body.type}/${body.name}` }, 404)
        }

        let extractDir: string | undefined
        try {
          extractDir = await RemoteEntitySource.downloadAndExtract(registryUrl, body.type, body.name)
          await installEntity(body.type, body.name, extractDir)
          if (body.type === "tool-group") ToolRegistry.reset()
          return c.json({ type: body.type, name: body.name, installed: true }, 201)
        } finally {
          if (extractDir) {
            await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {})
          }
        }
      },
    )
    .delete(
      "/:type/:name",
      describeRoute({
        summary: "Remove a locally installed entity",
        operationId: "entity.removeLocal",
        responses: {
          200: { description: "Entity removed" },
          400: { description: "Invalid entity type" },
        },
      }),
      async (c) => {
        const type = c.req.param("type")
        const name = c.req.param("name")

        // Refuse if the entity is owned by an installed plugin
        const cap = await CapabilityRegistry.getCapability(type as any, name)
        if (cap) {
          return c.json(
            { message: `Entity "${name}" is managed by plugin "${cap.pluginId}" — uninstall the plugin instead` },
            400,
          )
        }

        const root = PluginStorage.globalRoot()
        const p = type === "tool" ? await findToolFile(root, name) : entityDir(type, name, root)
        if (!p) return c.json({ message: "Invalid entity type" }, 400)
        await fs.rm(p, { recursive: true, force: true })
        if (type === "tool-group" || type === "tool") ToolRegistry.reset()
        return c.json(true)
      },
    ),
)
