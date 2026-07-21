# AGENTS.md

Local instructions for `packages/agent`.
Read the root file set first, then this package's local file set.

## Agent storage location

All agent definitions live in `~/.projectflows/agents/<id>/` — the **global** config root, regardless of which project is open. The runtime reads agents exclusively from this global location.

- `AgentStorage.loadAll(baseDir)` expects `baseDir = Global.Path.home` (i.e., `~`), so it resolves to `~/.projectflows/agents/`.
- `packages/runtime/src/agent.ts` — `agentBaseDir()` returns `Global.Path.home`, not `Instance.directory`. This is intentional: agents are global, not project-scoped.
- `Agent.initialize()` only ensures the agents directory exists. Default agent content is installed by registry plugins during onboarding/core setup; this package must not seed or bundle persona content.
- Project-local `.projectflows/agents/` directories in project repos are NOT scanned and should not exist.

## Rules

- Keep this package focused on file-based agent definitions and package-local storage helpers.
- Do not change `agentBaseDir()` in `packages/runtime/src/agent.ts` to use `Instance.directory` — agents are global, never project-scoped.
- Preserve compatibility for installed agent files unless a migration path is explicit.

## Editing guidance

- Default persona changes belong in the projectflows-website registry, not this package.
- Storage format changes should be treated as compatibility-sensitive because agents are stored on disk.
- If a change affects how the server reads installed agents, verify the integration point in `packages/runtime/src/agent.ts`.
