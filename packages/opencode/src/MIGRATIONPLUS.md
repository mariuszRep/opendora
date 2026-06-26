# Single-Export Re-Export Migration

## Status: COMPLETE ✅

All 32 re-export shim files tracked in this document have been deleted. This document is retired.

---

## What was tracked

Single-export re-export files in `packages/opencode/src` that existed as compatibility shims while callers were updated to import directly from `@opendora/*` packages.

## Summary of deletions (all done)

### Immediate deletions (0 direct imports — deleted)
1. `bun/registry.ts` → `@opendora/util/bun-registry`
2. `util/lock.ts` → `@opendora/util/lock`
3. `util/proxied.ts` → `@opendora/util/proxied`
4. `shell/shell.ts` → `@opendora/util/shell`
5. `file/ignore.ts` → `@opendora/tools/filesystem/lib/ignore`
6. `tool/agent-list.ts` → `@opendora/tools/agents/agent-list`
7. `tool/agent-update.ts` → `@opendora/tools/agents/agent-update`
8. `tool/session-search.ts` → `@opendora/tools/sessions`
9. `tool/bash.ts` → `@opendora/tools/shell`
10. `tool/batch.ts` → `@opendora/tools/shell`
11. `tool/delegate.ts` → `@opendora/tools/communication`
12. `tool/invalid.ts` → `@opendora/tools/system`
13. `tool/lsp.ts` → `@opendora/tools/system`
14. `tool/external-directory.ts` → `@opendora/tools/system`
15. `tool/codesearch.ts` → `@opendora/tools/browse-and-web`
16. `tool/websearch.ts` → `@opendora/tools/browse-and-web`
17. `tool/agent-get.ts` → `@opendora/tools/agents/agent-get`
18. `tool/agent-create.ts` → `@opendora/tools/agents/agent-create`
19. `tool/agent-delete.ts` → `@opendora/tools/agents/agent-delete`

### Required import updates before deletion (all done)
20. `flag/flag.ts` → `@opendora/util/flag` (13 imports updated)
21. `id/id.ts` → `@opendora/util/id` (1 import updated)
22. `util/log.ts` → `@opendora/util/log` (6 imports updated)
23. `util/process.ts` → `@opendora/util/process` (1 import updated)
24. `util/glob.ts` → `@opendora/util/glob` (3 imports updated)
25. `util/filesystem.ts` → `@opendora/tools/filesystem/lib/primitives` (10 imports updated)
26. `bus/bus-event.ts` → `@opendora/util/bus-event` (9 imports updated)
27. `bus/global.ts` → `@opendora/util/global-bus` (1 import updated)
28. `file/ripgrep.ts` → `@opendora/tools/filesystem/lib/ripgrep` (3 imports updated)
29. `tool/question.ts` → `@opendora/tools/communication` (1 import updated)
30. `tool/task.ts` → `@opendora/tools/system` (2 imports updated)
31. `tool/todo.ts` → `@opendora/tools/system` (1 import updated)
32. `tool/webfetch.ts` → `@opendora/tools/browse-and-web` (1 import updated)

---

See [MIGRATION.md](MIGRATION.md) for the remaining Phase 8 work (deleting `packages/opencode` itself).
