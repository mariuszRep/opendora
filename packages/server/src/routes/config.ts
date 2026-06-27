import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Config } from "@projectflows/config/config"
import { Provider } from "@projectflows/provider/provider"
import { mapValues } from "remeda"
import { errors } from "../error"
import { Log } from "@projectflows/util/log"
import { lazy } from "@projectflows/util/lazy"

const log = Log.create({ service: "server" })

const ModelGroupSlot = z.object({
  providerID: z.string().min(1),
  modelID: z.string().min(1),
})

const ModelGroupInput = z.object({
  name: z.string().min(1, "Group name is required"),
  models: z.array(ModelGroupSlot).min(2, "A fallback group needs at least 2 models"),
})

export const ConfigRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get configuration",
        description: "Retrieve the current OpenCode configuration settings and preferences.",
        operationId: "config.get",
        responses: {
          200: {
            description: "Get config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.get())
      },
    )
    .patch(
      "/",
      describeRoute({
        summary: "Update configuration",
        description: "Update OpenCode configuration settings and preferences.",
        operationId: "config.update",
        responses: {
          200: {
            description: "Successfully updated config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        const config = c.req.valid("json")
        await Config.update(config)
        return c.json(config)
      },
    )
    .get(
      "/providers",
      describeRoute({
        summary: "List config providers",
        description: "Get a list of all configured AI providers and their default models.",
        operationId: "config.providers",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    providers: Provider.Info.array(),
                    default: z.record(z.string(), z.string()),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        using _ = log.time("providers")
        const providers = await Provider.list().then((x) => mapValues(x, (item) => item))
        return c.json({
          providers: Object.values(providers),
          default: mapValues(providers, (item) => Provider.sort(Object.values(item.models))[0].id),
        })
      },
    )
    .post(
      "/model-groups",
      describeRoute({
        summary: "Create model group",
        description: "Create a new fallback model group with an ordered list of provider/model slots.",
        operationId: "config.modelGroups.create",
        responses: {
          200: {
            description: "Created group",
            content: {
              "application/json": {
                schema: resolver(z.object({ id: z.string(), name: z.string(), models: z.array(ModelGroupSlot) })),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", ModelGroupInput),
      async (c) => {
        const { name, models } = c.req.valid("json")
        const config = await Config.get()
        const groups = config.model_groups ?? []
        const id = crypto.randomUUID()
        const newGroup = { id, name, models }
        await Config.update({ model_groups: [...groups, newGroup] })
        return c.json(newGroup)
      },
    )
    .put(
      "/model-groups/:id",
      describeRoute({
        summary: "Update model group",
        description: "Update an existing fallback model group.",
        operationId: "config.modelGroups.update",
        responses: {
          200: {
            description: "Updated group",
            content: {
              "application/json": {
                schema: resolver(z.object({ id: z.string(), name: z.string(), models: z.array(ModelGroupSlot) })),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      validator("json", ModelGroupInput),
      async (c) => {
        const { id } = c.req.valid("param")
        const { name, models } = c.req.valid("json")
        const config = await Config.get()
        const groups = config.model_groups ?? []
        const idx = groups.findIndex((g) => g.id === id)
        if (idx === -1) return c.json({ error: "Group not found" }, 404)
        const updated = groups.map((g, i) => (i === idx ? { id, name, models } : g))
        await Config.update({ model_groups: updated })
        return c.json({ id, name, models })
      },
    )
    .delete(
      "/model-groups/:id",
      describeRoute({
        summary: "Delete model group",
        description: "Delete a fallback model group by ID.",
        operationId: "config.modelGroups.delete",
        responses: {
          200: {
            description: "Deleted successfully",
            content: { "application/json": { schema: resolver(z.boolean()) } },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const config = await Config.get()
        const groups = config.model_groups ?? []
        if (!groups.some((g) => g.id === id)) return c.json({ error: "Group not found" }, 404)
        await Config.update({ model_groups: groups.filter((g) => g.id !== id) })
        return c.json(true)
      },
    ),
)
