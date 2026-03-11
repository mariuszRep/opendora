# ROADMAP.md

## Known planned work

- Replace runtime Bun `$` usage in `src/` with the `src/util/process.ts` abstraction in phases.
- Keep explicit shell-only exceptions limited and documented during that migration.
- Stabilize migration-related tests and smoke coverage as the shell migration proceeds.

## Source plan retained here

The shell migration plan in `BUN_SHELL_MIGRATION_PLAN.md` remains a useful detailed reference for:

- phased rollout order
- hotspots
- validation strategy
- definition of done

## Other package-level future work

- Additional package-local roadmap items are unknown unless they are captured in code or docs.
