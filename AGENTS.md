# AGENTS.md

Repository-wide instructions for agents working in `opendora`.

## Read order

Before changing code in any scope, read:

1. This root `AGENTS.md`
2. The root [`SCOPE.md`](/home/ubuntu/projects/opendora/SCOPE.md), [`STATE.md`](/home/ubuntu/projects/opendora/STATE.md), and [`ROADMAP.md`](/home/ubuntu/projects/opendora/ROADMAP.md)
3. The nearest nested `AGENTS.md`, `SCOPE.md`, `STATE.md`, and `ROADMAP.md` for the package or app you are editing

Nested files inherit parent context by default. Treat nested files as stricter or more specific unless they explicitly mark something as `unknown` or `needs verification`.

## Repository rules

- Keep changes scoped to the package or app you are working in.
- Do not silently contradict a parent scope document. Update the parent document too if repository-wide truth changes.
- Preserve existing behavior unless the task explicitly changes it.
- Do not present planned work as implemented. Put shipped facts in `STATE.md` and proposed work in `ROADMAP.md`.
- Mark uncertain claims as `needs verification` or `unknown`.
- Prefer existing scripts, build steps, and generators over ad hoc replacements.

## Application & Package map

The architecture enforces the following boundaries. Adhere to these when making structural or logic changes:

**Applications (Consumers):**
- `apps/server` - API Runtime, CLI, Bootstrapping logic
- `apps/web` - Next.js UI Frontend

**Packages (Libraries):**
- `packages/agents` - Definitions, logic, templates
- `packages/providers` - LLM interaction wrappers
- `packages/skills` - Chain / workflow definitions 
- `packages/tools` - Agent action implementations
- `packages/sessions` - Memory and engine iterations
- `packages/ui` - Reusable frontend components
- `packages/db` - Database setup, clients, schemas
- `packages/utils` - Low-level shared utilities

## Documentation maintenance

- If you learn a stable fact about current behavior, update the relevant `STATE.md`.
- If you define a new boundary or ownership rule, update the relevant `SCOPE.md`.
- If you add or tighten workflow constraints for agents, update the relevant `AGENTS.md`.
- If you capture future work, move it into the nearest `ROADMAP.md`.
