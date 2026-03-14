# STATE.md

## Current package shape

- The package is a private Next.js app using React 19 and Next 16.
- It includes route files under `app/`, shared components under `components/`, and hooks under `hooks/`.
- The root app page redirects to `/dashboard`.

## Current development surface

- `package.json` defines `dev`, `build`, `start`, `lint`, and `typecheck` scripts.
- The root workspace script `bun run dev:ui` runs this app alongside the backend.

## Needs verification or unknown

- Whether this app is feature-complete or experimental needs verification.
- Whether all dashboard routes are wired to live backend data is unknown.
