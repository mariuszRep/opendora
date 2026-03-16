import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Agent } from "../../agent"
import { AgentStorage } from "@opendora/agent"
import { ToolRegistry } from "../../tool/registry"
import { lazy } from "../../util/lazy"
import { errors } from "../error"
import { Session } from "../../session"

const AgentConfigPatch = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all", "worker", "system"]).optional(),
  model: z.object({ modelID: z.string(), providerID: z.string() }).optional(),
  fallback_model: z.object({ modelID: z.string(), providerID: z.string() }).optional(),
  models: z.array(z.object({ modelID: z.string(), providerID: z.string() })).optional(),
  temperature: z.number().optional(),
  steps: z.number().int().positive().optional(),
  color: z.string().optional(),
  hidden: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  enableInjection: z.boolean().optional(),
})

export const AgentRoutes = lazy(() =>
  new Hono()

    // GET /agent — list all agents (native + file-based)
    .get(
      "/",
      describeRoute({
        summary: "List agents",
        description: "Get a list of all available agents, including file-based agents in .opendora/agents/.",
        operationId: "agent.list",
        responses: {
          200: {
            description: "List of agents",
            content: {
              "application/json": {
                schema: resolver(Agent.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Agent.list())
      },
    )

    // GET /agent/tools — list all available tool ids
    .get(
      "/tools",
      describeRoute({
        summary: "List available tools",
        description: "Get a list of all tool IDs available in the runtime.",
        operationId: "agent.tools.list",
        responses: {
          200: {
            description: "Tool IDs",
            content: {
              "application/json": {
                schema: resolver(z.array(z.string())),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await ToolRegistry.ids())
      },
    )

    // GET /agent/:id — single agent info
    .get(
      "/:id",
      describeRoute({
        summary: "Get agent",
        description: "Get a single agent by id.",
        operationId: "agent.get",
        responses: {
          200: {
            description: "Agent info",
            content: {
              "application/json": {
                schema: resolver(Agent.Info),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const agent = await Agent.get(id)
        if (!agent) return c.json({ error: `agent "${id}" not found` }, 404)
        return c.json(agent)
      },
    )

    // POST /agent — create a new file-based agent
    .post(
      "/",
      describeRoute({
        summary: "Create agent",
        description: "Create a new agent. Writes agent.json and persona.md into .opendora/agents/<id>/.",
        operationId: "agent.create",
        responses: {
          201: {
            description: "Agent created",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    id: z.string(),
                    config: AgentStorage.Config,
                    persona: z.string(),
                    injection: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          id: z.string().optional().meta({ description: "Agent id slug. Derived from name when omitted." }),
          config: AgentStorage.Config,
          persona: z.string().optional().default(""),
          injection: z.string().optional().default(""),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const id = body.id ? AgentStorage.toId(body.id) : AgentStorage.toId(body.config.name)
        const entry = await Agent.create(id, body.config, body.persona, body.injection)
        return c.json(entry, 201)
      },
    )

    // PATCH /agent/:id — update an existing agent's config (and optionally persona)
    .patch(
      "/:id",
      describeRoute({
        summary: "Update agent",
        description: "Partially update an agent's config. Pass persona to also update persona.md.",
        operationId: "agent.update",
        responses: {
          200: {
            description: "Updated agent file entry",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    id: z.string(),
                    config: AgentStorage.Config,
                    persona: z.string(),
                    injection: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      validator(
        "json",
        z.object({
          config: AgentConfigPatch.optional(),
          persona: z.string().optional(),
          injection: z.string().optional(),
        }),
      ),
      async (c) => {
        const { id } = c.req.valid("param")
        const body = c.req.valid("json")
        const entry = await Agent.update(id, body.config ?? {}, body.persona, body.injection)
        return c.json(entry)
      },
    )

    // DELETE /agent/:id — delete a file-based agent
    .delete(
      "/:id",
      describeRoute({
        summary: "Delete agent",
        description: "Delete an agent's .opendora/agents/<id>/ directory.",
        operationId: "agent.delete",
        responses: {
          200: {
            description: "Agent deleted",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        await Agent.remove(id)
        return c.json(true)
      },
    )

    // GET /agent/:id/persona — get persona.md content
    .get(
      "/:id/persona",
      describeRoute({
        summary: "Get agent persona",
        description: "Get the raw persona.md content for an agent.",
        operationId: "agent.persona.get",
        responses: {
          200: {
            description: "Persona markdown text",
            content: {
              "application/json": {
                schema: resolver(z.object({ persona: z.string() })),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const persona = await Agent.getPersona(id)
        return c.json({ persona })
      },
    )

    // PUT /agent/:id/persona — overwrite persona.md
    .put(
      "/:id/persona",
      describeRoute({
        summary: "Set agent persona",
        description: "Overwrite the persona.md for an agent.",
        operationId: "agent.persona.set",
        responses: {
          200: {
            description: "Persona updated",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      validator("json", z.object({ persona: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const { persona } = c.req.valid("json")
        await Agent.setPersona(id, persona)
        return c.json(true)
      },
    )

    // GET /agent/:id/injection — get injection.md content
    .get(
      "/:id/injection",
      describeRoute({
        summary: "Get agent injection",
        description: "Get the raw INJECTION.md content for an agent.",
        operationId: "agent.injection.get",
        responses: {
          200: {
            description: "Injection markdown text",
            content: {
              "application/json": {
                schema: resolver(z.object({ injection: z.string() })),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const injection = await Agent.getInjection(id)
        return c.json({ injection })
      },
    )

    // PUT /agent/:id/injection — overwrite injection.md
    .put(
      "/:id/injection",
      describeRoute({
        summary: "Set agent injection",
        description: "Overwrite the INJECTION.md for an agent.",
        operationId: "agent.injection.set",
        responses: {
          200: {
            description: "Injection updated",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      validator("json", z.object({ injection: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const { injection } = c.req.valid("json")
        await Agent.setInjection(id, injection)
        return c.json(true)
      },
    )

    // GET /agent/:id/main-session — get or create the main session for an agent
    .get(
      "/:id/main-session",
      describeRoute({
        summary: "Get agent main session",
        description:
          "Get or create the permanent 'role' session for an agent. When switching agents, this is the session that becomes active.",
        operationId: "agent.mainSession",
        responses: {
          200: {
            description: "Agent main session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const agent = await Agent.get(id)
        if (!agent) return c.json({ error: `agent "${id}" not found` }, 404)
        const session = await Session.ensureMainSession(id)
        return c.json(session)
      },
    )

    // PUT /agent/:id/main-session — promote a specific session to be the agent's main session
    .put(
      "/:id/main-session",
      describeRoute({
        summary: "Set agent main session",
        description: "Promote a session to be the agent's main (role) session. Demotes the previous main session to scope.",
        operationId: "agent.setMainSession",
        responses: {
          200: {
            description: "Promoted session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      validator("json", z.object({ sessionID: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const { sessionID } = c.req.valid("json")
        const agent = await Agent.get(id)
        if (!agent) return c.json({ error: `agent "${id}" not found` }, 404)
        const session = await Session.promoteToMain({ sessionID, agentID: id })
        return c.json(session)
      },
    )

    // POST /agent/generate — AI-generate an agent config from a description
    .post(
      "/generate",
      describeRoute({
        summary: "Generate agent config",
        description: "Use AI to generate an agent configuration from a plain-English description.",
        operationId: "agent.generate",
        responses: {
          200: {
            description: "Generated agent config",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    identifier: z.string(),
                    whenToUse: z.string(),
                    systemPrompt: z.string(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          description: z.string(),
          model: z
            .object({ providerID: z.string(), modelID: z.string() })
            .optional(),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const result = await Agent.generate(body)
        return c.json(result)
      },
    ),
)
