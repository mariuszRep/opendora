# SCOPE.md

## What this package is

`packages/ai-sdk` is a private Next.js application in this monorepo.

## What this package owns

- browser UI routes under `app/`
- reusable UI components, hooks, and styling local to the web app
- web-app-specific composition around OpenDora data and actions

## What this package does not own

- the backend API contract itself
- core session semantics
- shared CLI behavior

## Boundaries

- Use `packages/sdk/js` and `packages/opencode` as upstream integration surfaces.
- Keep web-only concerns in this package.
