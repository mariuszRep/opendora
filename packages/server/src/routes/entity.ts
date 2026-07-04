import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import fs from "fs/promises"
import path from "path"
import { RemoteEntitySource } from "@projectflows/plugin/source"
import { PluginStorage } from "@projectflows/plugin/storage"
import { Config } from "@projectflows/config/config"
import { lazy } from "@projectflows/util/lazy"

const DEFAULT_REGISTRY_URL = "https://projectflows.ai"

function entityDir(type: string, name: string, root: string): string | null {
  switch (type) {
    case "agent":
      return path.join(root, "agents", name)
    case "skill":
      return path.join(root, "skills", name)
    case "workflow":
      return path.join(root, "workflows", name + ".json")
    case "tool":
      return path.join(root, "tools", name + ".js")
    default:
      return null
  }
}

async function isInstalled(type: string, name: string): Promise<boolean> {
  const root = PluginStorage.globalRoot()
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

  if (type === "agent" || type === "skill") {
    const destDir = path.join(root, type === "agent" ? "agents" : "skills", name)
    await fs.mkdir(destDir, { recursive: true })
    const entries = await fs.readdir(extractDir, { withFileTypes: true })
    for (const entry of entries) {
      await fs.cp(path.join(extractDir, entry.name), path.join(destDir, entry.name), { recursive: true })
    }
  } else if (type === "tool") {
    await fs.mkdir(path.join(root, "tools"), { recursive: true })
    const src = path.join(extractDir, `${name}.js`)
    const dest = path.join(root, "tools", `${name}.js`)
    await fs.copyFile(src, dest)
  } else if (type === "workflow") {
    await fs.mkdir(path.join(root, "workflows"), { recursive: true })
    const src = path.join(extractDir, `${name}.json`)
    const dest = path.join(root, "workflows", `${name}.json`)
    await fs.copyFile(src, dest)
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
        const root = PluginStorage.globalRoot()
        const p = entityDir(type, name, root)
        if (!p) return c.json({ message: "Invalid entity type" }, 400)
        await fs.rm(p, { recursive: true, force: true })
        return c.json(true)
      },
    ),
)
