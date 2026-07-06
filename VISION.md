# VISION.md — Projectflows

> Owner: human. Approved intent only.
> This document records durable product/system intent, not roadmap or implementation status.
>

## Intent

Projectflows is a local-first agentic application platform where users operate and extend agents, skills, tools, workflows, schedules, sessions, providers, and related configuration through consistent application surfaces.

Projectflows is intended to remain lightweight at its core while supporting an ecosystem of installable extensions that can attach new capabilities and integrated experiences without turning every capability into a core module.

Projectflows manages five catalog-backed capability entity types: agents, skills, tools, workflows, and plugins. The projectflows.ai catalog is entity-first: agents, skills, tools, workflows, and plugins each have independent registry presence and individual download/install semantics. Plugins are packaging/manifest records that reference catalog entities by identifier rather than being the sole physical owner of entity source files. Agents, skills, tools, and workflows are individually discoverable and manageable product entities whose source may be local, project-local, plugin-contributed, MCP-contributed, or catalog-available.

The OpenDora Settings experience must present these five entity types through a unified card, search, filter, and install-state model. Installed, available, and local-only state must be computed consistently through a shared discovery/index contract rather than duplicated per page.

The published projectflows.ai catalog is the canonical remote catalog/index for plugins and catalog-managed entities. The `projectflows-website/registry` directory is the canonical first-party registry source; there is no separate legacy plugins repository.

**Bare-core principle.** The core binary is intentionally bare-metal: it includes only the essential application framework, plugin system, and any strictly necessary bootstrap capabilities. All optional capabilities — agents, skills, tools, workflows, MCP server presets, desktop/browser automation, and default capability packs — are contributed by installable plugins. The core binary must never bundle these optional capabilities.

**First-party capability source.** First-party optional capabilities are maintained in the `projectflows-website/registry` catalog. This registry contains official agents, skills, tools, workflows, MCP presets, and tool/source group metadata published through the projectflows.ai catalog. The core binary must not import or bundle first-party optional capabilities directly.

**Plugin storage model.** Installed plugins live under `.projectflows` directories: `~/.projectflows/plugins/installed/<plugin-id>/` for global/user-level installations and `<project>/.projectflows/plugins/installed/<plugin-id>/` for project-level installations. Plugins are never installed into the binary or application install directory. The plugin manifest schema, installer/resolver, runtime loading contracts, lockfile model, onboarding, and management APIs/UI are core-owned and must be implemented before removing any bundled optional capability.

Conversations and workflows are one durable execution model. A run — whether a normal conversation or a workflow — is a single durable, resumable, event-sourced execution. A normal conversation is the simplest workflow (message → reply); a workflow is the same run with more structure; and any conversation can be transformed into a reusable workflow.

**Architecture naming.** Workflows and workflow templates are the same product concept — use `workflows` as reusable definitions. Workflow executions and runs are represented by sessions (runtime containers). There is no separate `workflow_templates` concept or table. Entries are the immutable runtime ledger events; edges are the relationships, order, causality, containment, and forks between all graph entities (workflows, sessions, entries, tools, artifacts/resources). A single canonical edge table is used for all persisted cross-entity relationships.

Agent Builder is the durable agent-definition authoring model. It reuses the workflow/canvas authoring experience to compose agent definitions rather than execute work. Agent Builder canvas nodes compose agent persona, configuration, tools, skills, and permissions; the builder/page save action compiles the connected graph into existing agent definition fields. Form-style section editing remains available as alternate projections or section views of the same node-defined agent definition — the graph is canonical, forms are views. Agent Builder graph semantics are composition and compilation, not workflow execution.

Projectflows surfaces should use a consistent connected-node/line visual language when displaying linear or branching chains. Chat reply chains, agent definition sections (in graph view), workflow execution nodes, and branching workflow/graph histories should share a common visual idiom inspired by git graph representations: a dot or node per item, a line connecting the sequence, and branching lines for diverging paths. This principle applies across chat, workflow, and Agent Builder surfaces.

The graph-backed session ledger and its UI projection are one delivery — stored flow must be correctly projectable in the UI. Chat display encompasses both compact git-style rails for normal conversation views and full graph layout for expanded workflow, canvas, and debug views. Apps own presentation projections; session owns the ledger shape, typed edges, and display-order data that feed them.

## Owns

- Product-level architecture and boundaries for Projectflows.
- User-facing applications: web UI, CLI (CLI includes integrated terminal UI mode), and desktop application (Phase 2, Tauri-based cross-platform shell).
- A typed SDK gateway for application access.
- A server/service boundary that exposes Projectflows behavior.
- Runtime execution for live agentic work.
- Domain packages that own their own entities and behavior.
- Notification as a first-class domain package: modular, persistent, object-driven notification records covering system errors, tool errors, provider issues, tool access/permission requests, workflow/run blockers, memory/status events, and similar system events surfaced to users.
- A storage boundary for persistence.
- A plugin boundary for installable Projectflows capabilities.
- A mini-app integration boundary for standalone experiences that are visually and contextually integrated into Projectflows.
- Shared UI primitives and application design-system boundaries used by Projectflows surfaces and approved extensions.

## Does Not Own

- Package-specific domain rules that belong in package-scoped `VISION.md` files.
- Migration plans, implementation checklists, or status tracking.
- Agent operating instructions.
- Third-party extension business logic except through explicit Projectflows plugin, tool, workflow, mini-app, permission, and UI contracts.

## Relationships

```text
apps/web | apps/cli | apps/desktop
  -> sdk
    -> server
      -> auth
      -> permission
      -> notification
      -> runtime
        -> agent
        -> skills
        -> provider
        -> tools
        -> workflow
        -> schedule
        -> session

plugins
  -> declared capabilities
    -> agents
    -> skills
    -> tools
    -> MCP integrations
    -> workflows
    -> schedules
    -> UI extensions

mini-apps
  -> Projectflows context contracts
  -> Projectflows UI/design primitives
  -> plugin/workflow/tool/session data as permitted

domain packages that persist data
  -> storage
```

## Boundary Rules

- Apps are user-facing shells and must use the SDK instead of importing backend/domain internals.
- SDK is the typed client gateway and talks to the server only.
- Server is the API/service boundary that keeps Projectflows reachable, validates requests, applies auth/permission, exposes routes/streams, and coordinates package-owned operations.
- Runtime is the execution engine that keeps executable work alive: agent runs, tool calls, provider invocations, workflow advancement, schedule-triggered execution, streaming, cancellation, retries, and run lifecycle.
- Domain packages own their own entities and canonical behavior.
- Notification is a first-class domain package owning durable, object-driven notification records surfaced to users. Notifications cover system errors, tool errors, provider issues, tool access/permission requests, workflow/run blockers, memory/status events, and similar system events.
- Notification exposes a single canonical publish/create function that accepts a restricted but extensible notification object schema.
- Notifications cross-link to exact context: permission request location, session, message, tool call, provider/settings, and workflow/run origin.
- Permission owns authorization and permission lifecycle; notification owns durable user-facing notification records and cross-links. Permission requests are retained as notification history after reply, marked resolved/rejected/allowed, and removed from action-required count.
- Notification persists through storage contracts only.
- Storage is the only persistence boundary. Packages that need durable data use storage contracts instead of choosing JSON, SQLite, Postgres, files, or another backend directly.
- Session is the universal execution ledger and records run state/history through entries (immutable runtime events) connected by typed edges (relationships, order, causality, containment, forks); it is not the execution engine.
- A run is one durable, resumable, event-sourced execution; conversations and workflows share this model, and any conversation may be transformed into a reusable workflow.
- Durable run state — checkpoints, step journal, and suspend/resume tokens — is persisted only through storage contracts; runtime owns resume and replay; session records run state and history.
- Plugins are installable Projectflows extension packages. A plugin may contribute any subset of agents, skills, tools, MCP integrations, workflows, schedules, configuration, permissions, and UI extension surfaces.
- Users install extension capabilities as individual catalog entities or as plugin/pack bundles. Individual agents, skills, tools, and workflows contributed by plugins are discoverable and manageable as first-class entities through unified catalog surfaces.
- Plugin capabilities are installed under `.projectflows/plugins/installed/<plugin-id>/`, never inside the binary or application install directory.
- First-party optional capabilities are maintained in the `projectflows-website/registry` catalog. The published projectflows.ai catalog is the canonical remote catalog. The core binary must not bundle or import first-party optional capabilities.
- Tool grouping is manifest-driven, not hardcoded. Group manifests are the source of truth and are downloaded/installed from the catalog. Functional groups (e.g., "communication", "filesystem") are canonical for display, registry/catalog layout, installed storage, settings, and future MCP server grouping. Each tool group is modeled as close as possible to an MCP server boundary so it can later be converted into an MCP server without reclassifying tools. `sourceGroup` (`core`, `plugin:<plugin-id>`, `mcp:<server-id>`) remains provenance metadata only — it is not the grouping model. No legacy flat tools storage or backward compatibility is required after migration; the system aligns to the new structure.
- Plugin system implementation (manifest schema, installer/resolver, runtime loading contracts, lockfile model, onboarding, and management APIs/UI) must be completed before removing any bundled optional capability from the core binary.
- Core may include only `core-required` hidden/system/bootstrap capabilities if strictly necessary for the plugin system or minimal application function.
- Tools are a primary extension boundary because they may need execution behavior, schemas, permissions, configuration, and bespoke UI interaction/rendering surfaces.
- Mini-apps are standalone application experiences integrated into Projectflows visually and contextually; they are distinct from core modules and from ordinary plugin capability contributions.
- Mini-apps must use Projectflows-approved context, permission, storage, and UI/design-system contracts instead of depending on app internals.
- Extension UI must be built from Projectflows-approved primitives and design-system contracts so plugins and mini-apps remain visually consistent without copying app-owned implementation details.
- Agent Builder reuses workflow/canvas authoring infrastructure but owns composition/compilation semantics distinct from workflow execution. It does not change scheduled workflow execution ownership.
- Desktop application (Phase 2) is a Tauri v2 shell that wraps the same statically-exported web UI. It follows the same app rules: uses SDK, does not import backend internals, reuses shared UI components where feasible.

## Canonical Operations / Contracts

SDK methods, server routes, runtime flows, tools, plugins, mini-apps, UI extensions, and package integrations must converge on package-owned canonical operations rather than duplicating business behavior.
