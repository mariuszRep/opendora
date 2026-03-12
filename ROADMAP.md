# ROADMAP.md

## Repository-level direction

Near-term repository work implied by current goal of decoupling:

- Execute the migration to split `opencode` into standalone application (`apps/server`) and reusable packages (`tools`, `agents`, `skills`, `providers`, `db`).
- Rename and structure existing independent modules: `pingpong-core` becomes `sessions`, `ai-sdk` splits to `apps/web` and `packages/ui`.
- Enforce strict one-way dependency flow from Applications -> Packages -> External. 
- Ensure that the resulting system scales better with isolated testing.

## App/Package-specific work tracked elsewhere

Use local `ROADMAP.md` files for package plans:

- `apps/server` for API server, CLI and bootstrapping the environment.
- `apps/web` for frontend Dashboard flows.
- `packages/*` for domain isolation and functional expansion.

## Unknown or needs verification

- A repository-wide release plan is unknown.
- A repository-wide deployment roadmap is unknown.
