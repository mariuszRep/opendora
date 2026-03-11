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

## Package map

Use the local file set when working in these independently developable scopes:

- `packages/opencode` - main CLI, server, TUI, storage, tools, provider integration
- `packages/agent` - file-based agent definitions and template management
- `packages/ai-sdk` - Next.js web UI
- `packages/sdk/js` - generated and handwritten TypeScript SDK
- `packages/util` - shared utility helpers
- `packages/pingpong-core` - session and storage core library

## Documentation maintenance

- If you learn a stable fact about current behavior, update the relevant `STATE.md`.
- If you define a new boundary or ownership rule, update the relevant `SCOPE.md`.
- If you add or tighten workflow constraints for agents, update the relevant `AGENTS.md`.
- If you capture future work, move it into the nearest `ROADMAP.md`.
