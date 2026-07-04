# VISION.md — apps

> Owner: human. Approved intent only.
>
> **Naming note:** Projectflows is the canonical product direction. `apps/` contains all
> current application surfaces.

## Intent

`apps/` contains all user-facing application surfaces for Projectflows.

Apps own the unified catalog-management presentation for agents, skills, tools, workflows, and plugins. These surfaces must use consistent cards, search, filters, install-state badges, and source/provenance metadata. Apps may project entity-specific management actions, but must not duplicate discovery or install-state logic that belongs behind SDK/server/package contracts.

## Owns

- Web UI.
- CLI (command-line and terminal UI).
- Desktop application (Phase 2, Tauri v2 cross-platform shell).
- Application-specific presentation, interaction, navigation, and user experience logic.

## Does Not Own

- Backend business behavior.
- Domain package internals.
- Runtime execution internals.
- Physical persistence.
- Direct storage access.

## Relationships

- Apps use `sdk` as their only Projectflows backend gateway.
- Apps may contain UI-specific state and presentation logic.
- Shared product behavior belongs behind SDK/server/package contracts.

## Boundary Rules

- Web, CLI, and desktop live under `apps/`; CLI includes integrated terminal UI support.
- Desktop app (Phase 2) is a Tauri v2 shell wrapping the same statically-exported web UI. It uses SDK for backend communication; UI components are reused across embedded web and desktop where feasible.
- Apps call SDK methods instead of hand-writing server calls or importing backend packages.
- Apps must not duplicate package-owned domain behavior.
- Apps must not bypass server auth, permission, validation, or runtime coordination.
- Desktop app must not import backend/domain internals — it follows the same app rules as web and CLI.

## Visual Language

Projectflows should use a consistent connected-node/line visual language across chat reply chains, agent definition sections, workflow nodes, and branching workflow/graph histories. Inspired by git graph representations, items appear as dots or nodes connected by lines in sequence, with branching lines for diverging paths. Apps own the presentation of this visual language; backend graph semantics and connectivity rules remain in packages.

### Chat side rail projection

Each visible chat/session entry shows a compact git-style side rail projecting session lineage. The side rail is a presentation-layer projection of session graph data — the source of truth is session entries/messages, typed edges, and display order, not component state.

- Normal chat renders as one continuous chronological rail.
- Branch visualization appears only when workflow/agent execution creates multiple outgoing edges from one entry.
- Fan-in/merge visually rejoins paths where graph edges indicate convergence.
- Parallel outputs display in event time or explicit display_order while lineage follows edges.

Existing chat rendering is reused and extended rather than replaced. Current spinner/loading treatment while an agent or workflow is thinking or running is preserved.

### Rendering approaches

- **@gitgraph/react** — provides the compact git-style chat side rail where feasible and validated. It is a presentation-layer concern only, coexisting with existing app components. It does not change backend or session ownership.
- **React Flow** — provides full/expanded workflow, canvas, debug views, and Agent Builder graph composition, following React Flow standards and patterns: nodes/edges shape, stable node IDs, typed edges, branch/fan-out/fan-in semantics, layout/projection separation, and memoized/custom node-like renderers. Backend-specific UI concerns must not leak into session or storage domains.

### Visual markers

Session entries use consistent markers based on entry actor:

| Actor | Marker |
|---|---|
| assistant / agent | Dot |
| user | Dot with surrounding circle |
| workflow | Circle |
| system | Subdued/internal marker, or hidden/collapsed unless relevant |

Different assistant/agent identities may use different colors while preserving the same `assistant` actor model. Identity/color is presentation metadata, not a separate actor type.
