# AGENTS.md

Local instructions for `packages/util`.
Read the root file set first, then this package's local file set.

## Rules

- Keep this package small and generic.
- Do not move package-specific runtime logic here just to avoid imports.
- Favor utilities that are reusable across multiple packages.

## Editing guidance

- If a helper is only used by one package and depends on that package's domain model, it likely does not belong here.
