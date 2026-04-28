import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { PermissionNext } from "@/permission/next"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

export const PermissionRoutes = lazy(() =>
  new Hono()
    .post(
      "/:requestID/reply",
      describeRoute({
        summary: "Respond to permission request",
        description: "Approve or deny a permission request from the AI assistant.",
        operationId: "permission.reply",
        responses: {
          200: {
            description: "Permission processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          requestID: z.string(),
        }),
      ),
      validator("json", z.object({ reply: PermissionNext.Reply, message: z.string().optional() })),
      async (c) => {
        const params = c.req.valid("param")
        const json = c.req.valid("json")
        await PermissionNext.reply({
          requestID: params.requestID,
          reply: json.reply,
          message: json.message,
        })
        return c.json(true)
      },
    )
    .get(
      "/",
      describeRoute({
        summary: "List pending permissions",
        description: "Get all pending permission requests across all sessions.",
        operationId: "permission.list",
        responses: {
          200: {
            description: "List of pending permissions",
            content: {
              "application/json": {
                schema: resolver(PermissionNext.Request.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const permissions = await PermissionNext.list()
        return c.json(permissions)
      },
    )
    .get(
      "/approved",
      describeRoute({
        summary: "List approved permissions",
        description: "Get all approved permission rules for the current project.",
        operationId: "permission.listApproved",
        responses: {
          200: {
            description: "List of approved permissions",
            content: {
              "application/json": {
                schema: resolver(PermissionNext.Ruleset),
              },
            },
          },
        },
      }),
      async (c) => {
        const permissions = await PermissionNext.listApproved()
        return c.json(permissions)
      },
    )
    .post(
      "/approved",
      describeRoute({
        summary: "Add permission rule",
        description: "Add a new permission rule to the approved list.",
        operationId: "permission.addRule",
        responses: {
          200: {
            description: "Permission rule added",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator("json", PermissionNext.AddRule),
      async (c) => {
        const input = c.req.valid("json")
        await PermissionNext.addRule(input)
        return c.json(true)
      },
    )
    .delete(
      "/approved",
      describeRoute({
        summary: "Remove permission rule",
        description: "Remove a permission rule from the approved list.",
        operationId: "permission.removeRule",
        responses: {
          200: {
            description: "Permission rule removed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator("json", PermissionNext.RemoveRule),
      async (c) => {
        const input = c.req.valid("json")
        await PermissionNext.removeRule(input)
        return c.json(true)
      },
    ),
)
