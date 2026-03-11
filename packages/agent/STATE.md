# STATE.md

## Current package behavior

- The package exports `./src/index.ts` and `./templates`.
- Agent storage is file-based rather than split between hardcoded and custom agent paths.
- Built-in templates include `build`, `plan`, `explore`, `general`, `compaction`, `title`, and `summary`.
- The README states templates are seeded on first run and can be edited, reset, or deleted.

## Storage model documented today

Agent data is documented as living under `.opendora/agents/` with:

- `index.json`
- one directory per agent
- `agent.json`
- `PERSONA.md`

That storage layout should be treated as current package documentation, but exact runtime guarantees still need verification against code.

## Needs verification or unknown

- Whether all README examples exactly match the current exported API needs verification.
- Whether all template names in the README still match the source files needs verification.
