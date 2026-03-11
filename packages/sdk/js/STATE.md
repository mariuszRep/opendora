# STATE.md

## Current package behavior

- The package exports root, client, server, and v2 entry points.
- `script/build.ts` generates SDK code from an OpenAPI document produced by `packages/opencode`.
- Generated output is written into `src/v2/gen`, then formatted and compiled to `dist`.
- The package publishes from `dist` according to `publishConfig.directory`.

## Current dependencies visible from code

- Generation uses `@hey-api/openapi-ts`.
- The build script shells into the `packages/opencode` package to produce `openapi.json`.

## Needs verification or unknown

- Whether both `src/gen` and `src/v2/gen` are equally current needs verification.
- Whether the v2 SDK is the preferred consumer surface is unknown.
