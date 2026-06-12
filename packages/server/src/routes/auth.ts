import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { RegistrationSchema } from "@opendora/auth/registration"
import { errors } from "../error"
import { lazy } from "@opendora/util/lazy"
import z from "zod"

export const AuthRoutes = lazy(() =>
  new Hono().put(
    "/register",
    describeRoute({
      summary: "Register a new user",
      description: "Register a new user account with email and password.",
      operationId: "auth.register",
      responses: {
        200: {
          description: "Registration successful",
          content: {
            "application/json": {
              schema: resolver(
                z
                  .object({
                    success: z.literal(true),
                    message: z.string(),
                    email: z.string().email(),
                  })
                  .meta({ ref: "RegistrationSuccess" }),
              ),
            },
          },
        },
        400: {
          description: "Validation error",
          content: {
            "application/json": {
              schema: resolver(
                z
                  .object({
                    success: z.literal(false),
                    errors: z.array(
                      z.object({
                        field: z.string(),
                        message: z.string(),
                      }),
                    ),
                  })
                  .meta({ ref: "ValidationError" }),
              ),
            },
          },
        },
      },
    }),
    validator("json", RegistrationSchema),
    async (c) => {
      const data = c.req.valid("json")
      // TODO: Implement actual registration logic (e.g., save to database)
      return c.json({
        success: true,
        message: "Registration successful",
        email: data.email,
      })
    },
  ),
)