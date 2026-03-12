# SCOPE.md

## What this repository is

`opendora` is a Bun-based monorepo for an AI-assisted development system. It is transitioning to a decoupled application and package-led structure:

- Applications in `apps/`:
  - `web`: Next.js frontend UI.
  - `server`: API runtime and CLI tool.
- Packages in `packages/`:
  - `agents`: Agent definition logic.
  - `sessions`: Session execution engine.
  - `tools`: Functional executable tools.
  - `providers`: LLM integrations.
  - `skills`: Automated workflows.
  - `ui`: Shared UI library.
  - `db`: Database logic.
  - `utils`: Shared utilities.

## Repository ownership

The repository root owns:

- workspace configuration
- shared scripts and package relationships
- repository-level documentation and development conventions
- integration expectations between packages

## Repository boundaries

The repository does own:

- the monorepo composition and package contracts that are visible in committed code
- generated API artifacts that are committed, such as `packages/sdk/openapi.json`

The repository does not, by itself, own:

- production deployment topology
- hosted infrastructure details
- external service configuration beyond what the code and docs explicitly show

## Local scopes

The targeted decoupled architecture introduces these definitive independent boundaries:

**Apps:**
- `apps/server`
- `apps/web`

**Packages:**
- `packages/agents`
- `packages/providers`
- `packages/skills`
- `packages/tools`
- `packages/sessions`
- `packages/ui`
- `packages/db`
- `packages/utils`

Other directories inherit root context unless a nearer file set says otherwise.
