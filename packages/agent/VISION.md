# VISION.md — packages/agent

> Owner: human. Approved intent only.

## Intent

Agent owns OpenDora agent definitions and agent-facing metadata.

## Owns

- Agent definitions, roles, and metadata.
- Agent templates and configuration shape.
- Agent discovery/loading contracts.
- Agent-run linkage to sessions.
- Agent-declared default permissions, embedded/agent-scoped permission requirements, attached skills, and attached tools as part of the agent definition shape.

## Does Not Own

- Runtime execution loop.
- Tool execution.
- Skill implementation.
- Permission lifecycle, policy evaluation, or authorization decisions.
- Physical persistence backend choice.

## Depends On

- storage, when persisted agent definitions are needed.
- permission, when agent-defined permission metadata must be resolved or validated.
- skills and tools by reference when an agent attaches skills or tools.

## Used By

- runtime
- server
- tools or management surfaces as needed

## Boundary Rules

- Agent defines what an agent is, including its declared skills, tools, and permission metadata.
- Agent permission declarations are not authorization decisions; permission owns effective allow/deny evaluation.
- Runtime decides when and how an agent runs and assembles the active execution context.
- Runtime may use agent-declared skills/tools/permissions while still enforcing permission checks before protected actions.
- Agent runs are captured through sessions or session-linked run records.

## Agent Builder Canvas

Agent Builder is the durable agent-definition authoring surface. Agent definitions are authored as node-driven definition graphs that match the existing agent definition shape. Each node type corresponds to a definition section or setting: agent metadata/settings, persona/system prompt, structured JSON/config, tools, skills, permissions, model/settings, injection, and future definition fields. The form-style section UI remains available but is a section/projection view into the canonical node-defined agent definition — the node graph is the canonical model, the form is a view of it. Agent Builder composes definitions through a connected graph of canvas nodes; it does not execute work.

### Canvas node semantics

- **Agent node** is the canvas anchor. It represents the agent being built and owns top-level settings: name, description, mode, default model, max loop turns/steps if configured, and future loop policy defaults.
- The Agent node bottom/input handle connects definition/config contributors: Prompt/Persona/Role nodes, Tool and Skill nodes, Permission nodes, model/settings nodes if represented separately, and other future agent config nodes.
- **Prompt/Persona/Role** are one concept. Prompt-producing nodes compose the persisted persona/system prompt in edge order.
- **Tool and Skill nodes** reuse existing discovery/selection concepts where possible and compile to agent tool/skill assignments. They are not runtime tool calls in Agent Builder.
- **Permissions node** is a required new concept for composing agent permission rules. Permission package still owns evaluation and authorization.
- The Agent node right/side handle connects the **Injection node**. Injection compiles to separate injection content, not part of the base system prompt. Presence of an Injection node enables injection; absence means no injection.
- **Max loop steps/turns** is an agent runtime limit setting, not workflow step order.
- The builder/page save action compiles the connected graph into existing agent definition fields. There is no Save/Output Agent node.

### Relationship to workflow canvas

Agent Builder reuses workflow canvas/node infrastructure but with composition/compilation semantics, not workflow execution. This does not change scheduled workflow execution ownership.

## Canonical Operations

Agent management tools, SDK routes, runtime flows, and package integrations must use the package-owned agent operations for create, read, update, delete, list, load, and agent attachment behavior.
