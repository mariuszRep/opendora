import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { NotFoundError } from "@projectflows/storage/db"
import { PluginInstaller, PluginCoreRequiredError, PluginHasDependentsError } from "@projectflows/plugin"
import { Onboarding } from "@projectflows/plugin/onboarding"
import { errors } from "../error"
import { lazy } from "@projectflows/util/lazy"
import { CatalogReader } from "../catalog"

const PluginListItemSchema = z.object({
  pluginId: z.string(),
  name: z.string().optional(),
  version: z.string(),
  scope: z.enum(["global", "project"]),
  source: z.string(),
  installedAt: z.string(),
  enabled: z.boolean(),
  capabilities: z.array(z.object({ type: z.string(), name: z.string(), sourceGroup: z.string() })),
  dependencies: z.array(z.string()).optional(),
})

export const PluginRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List installed plugins",
        operationId: "plugin.list",
        responses: {
          200: {
            description: "Installed plugins",
            content: { "application/json": { schema: resolver(PluginListItemSchema.array()) } },
          },
        },
      }),
      async (c) => {
        const plugins = await PluginInstaller.list()
        return c.json(plugins)
      },
    )
    .get(
      "/:id",
      describeRoute({
        summary: "Get plugin info",
        operationId: "plugin.get",
        responses: {
          200: {
            description: "Plugin info",
            content: { "application/json": { schema: resolver(PluginListItemSchema) } },
          },
          ...errors(404),
        },
      }),
      async (c) => {
        const entry = await PluginInstaller.info(c.req.param("id"))
        if (!entry) throw new NotFoundError({ message: `Plugin not found: ${c.req.param("id")}` })
        return c.json(entry)
      },
    )
    .post(
      "/install",
      describeRoute({
        summary: "Install a plugin from a local path",
        operationId: "plugin.install",
        responses: {
          201: {
            description: "Plugin installed",
            content: { "application/json": { schema: resolver(PluginListItemSchema) } },
          },
          ...errors(400, 409),
        },
      }),
      async (c) => {
        const body = await c.req.json<{ path: string; scope?: "global" | "project" }>()
        if (!body.path) {
          return c.json({ message: "path is required" }, 400)
        }
        try {
          const entry = await PluginInstaller.install({ sourcePath: body.path, scope: body.scope ?? "global" })
          return c.json(entry, 201)
        } catch (err) {
          if (err instanceof Error && err.name === "PluginConflictError") {
            return c.json({ message: err.message }, 409)
          }
          throw err
        }
      },
    )
    .delete(
      "/:id",
      describeRoute({
        summary: "Remove an installed plugin",
        operationId: "plugin.remove",
        responses: {
          204: { description: "Plugin removed" },
          ...errors(400, 404),
        },
      }),
      async (c) => {
        const id = c.req.param("id")
        try {
          await PluginInstaller.remove(id, { scope: "global" })
        } catch (err) {
          if (err instanceof PluginCoreRequiredError || err instanceof PluginHasDependentsError) {
            return c.json({ message: err.message }, 400)
          }
          throw err
        }
        return c.body(null, 204)
      },
    )
    .patch(
      "/:id/enable",
      describeRoute({
        summary: "Enable a plugin",
        operationId: "plugin.enable",
        responses: { 204: { description: "Plugin enabled" }, ...errors(404) },
      }),
      async (c) => {
        await PluginInstaller.setEnabled(c.req.param("id"), true, { scope: "global" })
        return c.body(null, 204)
      },
    )
    .patch(
      "/:id/disable",
      describeRoute({
        summary: "Disable a plugin",
        operationId: "plugin.disable",
        responses: { 204: { description: "Plugin disabled" }, ...errors(404) },
      }),
      async (c) => {
        await PluginInstaller.setEnabled(c.req.param("id"), false, { scope: "global" })
        return c.body(null, 204)
      },
    )
    .get(
      "/catalog/packs",
      describeRoute({
        summary: "List available capability packs from the catalog",
        operationId: "plugin.catalog.packs",
        responses: {
          200: { description: "Available packs" },
        },
      }),
      async (c) => {
        return c.json(await CatalogReader.listPacks())
      },
    )
    .post(
      "/catalog/packs/:id/install",
      describeRoute({
        summary: "Install all plugins in a capability pack",
        operationId: "plugin.catalog.packs.install",
        responses: {
          200: { description: "Installed plugins" },
          404: { description: "Pack not found" },
        },
      }),
      async (c) => {
        const pack = await CatalogReader.getPack(c.req.param("id"))
        if (!pack) return c.json({ message: `Pack not found: ${c.req.param("id")}` }, 404)
        const results = []
        for (const pluginId of pack.plugins) {
          const sourcePath = CatalogReader.pluginSourcePath(pluginId)
          const item = await PluginInstaller.install({ sourcePath, scope: "global" })
          results.push(item)
        }
        await Onboarding.write({
          completedAt: new Date().toISOString(),
          skipped: false,
          selectedPacks: [pack.id],
          installedPlugins: pack.plugins,
        })
        return c.json(results)
      },
    )
    .post(
      "/catalog/skip",
      describeRoute({
        summary: "Skip onboarding without installing any pack",
        operationId: "plugin.catalog.skip",
        responses: { 200: { description: "Onboarding skipped" } },
      }),
      async (c) => {
        await Onboarding.write({
          completedAt: new Date().toISOString(),
          skipped: true,
          selectedPacks: [],
          installedPlugins: [],
        })
        return c.json({ ok: true })
      },
    )
    .get(
      "/catalog/onboarding-status",
      describeRoute({
        summary: "Check if onboarding is needed",
        operationId: "plugin.catalog.onboarding-status",
        responses: { 200: { description: "Onboarding status" } },
      }),
      async (c) => {
        const state = await Onboarding.read()
        const plugins = await PluginInstaller.list()
        return c.json({
          needsOnboarding: state === null && plugins.length === 0,
          state,
        })
      },
    ),
)
