# Single-Export Re-Export Migration

This document tracks single-export re-export files in `packages/opencode/src` that can be removed after updating all import paths to point directly to their source packages.

## Overview

These files contain only a single `export { X } from "@opendora/..."` line. They exist as compatibility shims but should be removed in favor of direct imports.

## Files by Directory

### bun/
- `registry.ts` - exports `PackageRegistry` from `@opendora/util/bun-registry`
  - **Status:** NO direct imports from `@/bun/registry` in opencode
  - **Action:** Can be deleted immediately
  - **Replacement:** Use `@opendora/util/bun-registry` directly

### flag/
- `flag.ts` - exports `Flag` from `@opendora/util/flag`
  - **Direct imports from @/flag/flag:** 13 files in opencode
  - **Flag usage from @opendora/util/flag:** 8 files in other packages
  - **Action:** Update 13 opencode imports, then delete
  - **Replacement:** Use `@opendora/util/flag` directly

### id/
- `id.ts` - exports `Identifier` from `@opendora/util/id`
  - **Direct imports from @/id/id:** 1 file in opencode
  - **Identifier usage from @opendora/util/id:** 14 files across packages
  - **Action:** Update 1 opencode import, then delete
  - **Replacement:** Use `@opendora/util/id` directly

### util/
- `log.ts` - exports `Log` from `@opendora/util/log`
  - **Direct imports from @/util/log:** 6 files in opencode
  - **Log usage from @opendora/util/log:** 14 files in server package
  - **Action:** Update 6 opencode imports, then delete
  - **Replacement:** Use `@opendora/util/log` directly

- `process.ts` - exports `Process` from `@opendora/util/process`
  - **Direct imports from @/util/process:** 1 file in opencode
  - **Process usage from @opendora/util/process:** 1 file in server package
  - **Action:** Update 1 opencode import, then delete
  - **Replacement:** Use `@opendora/util/process` directly

- `glob.ts` - exports `Glob` from `@opendora/util/glob`
  - **Direct imports from @/util/glob:** 3 files in opencode
  - **Glob usage from @opendora/util/glob:** 1 test file in opencode
  - **Action:** Update 3 opencode imports, then delete
  - **Replacement:** Use `@opendora/util/glob` directly

- `filesystem.ts` - exports `Filesystem` from `@opendora/tools/filesystem/lib/primitives`
  - **Direct imports from @/util/filesystem:** 10 files in opencode
  - **Filesystem usage from @opendora/tools/filesystem/lib/primitives:** 12+ files across packages
  - **Action:** Update 10 opencode imports, then delete
  - **Replacement:** Use `@opendora/tools/filesystem/lib/primitives` directly

- `lock.ts` - exports `Lock` from `@opendora/util/lock`
  - **Direct imports from @/util/lock:** 0 files in opencode
  - **Lock usage from @opendora/util/lock:** 3 files in other packages
  - **Action:** Can be deleted immediately
  - **Replacement:** Use `@opendora/util/lock` directly

- `proxied.ts` - exports `proxied` from `@opendora/util/proxied`
  - **Direct imports from @/util/proxied:** 0 files in opencode
  - **proxied usage from @opendora/util/proxied:** 2 files in other packages
  - **Action:** Can be deleted immediately
  - **Replacement:** Use `@opendora/util/proxied` directly

### shell/
- `shell.ts` - exports `Shell` from `@opendora/util/shell`
  - **Direct imports from @/shell/shell:** 0 files in opencode
  - **Shell usage from @opendora/util/shell:** 2 files in server package
  - **Action:** Can be deleted immediately
  - **Replacement:** Use `@opendora/util/shell` directly

### bus/
- `bus-event.ts` - exports `BusEvent` from `@opendora/util/bus-event`
  - **Direct imports from @/bus/bus-event:** 9 files in opencode
  - **BusEvent usage from @opendora/util/bus-event:** 14 files across packages
  - **Action:** Update 9 opencode imports, then delete
  - **Replacement:** Use `@opendora/util/bus-event` directly

- `global.ts` - exports `GlobalBus` from `@opendora/util/global-bus`
  - **Direct imports from @/bus/global:** 1 file in opencode
  - **GlobalBus usage from @opendora/util/global-bus:** 7 files across packages
  - **Action:** Update 1 opencode import, then delete
  - **Replacement:** Use `@opendora/util/global-bus` directly

### file/
- `ripgrep.ts` - exports `Ripgrep` from `@opendora/tools/filesystem/lib/ripgrep`
  - **Direct imports from @/file/ripgrep:** 3 files in opencode
  - **Ripgrep usage from @opendora/tools/filesystem/lib/ripgrep:** 6+ files across packages
  - **Action:** Update 3 opencode imports, then delete
  - **Replacement:** Use `@opendora/tools/filesystem/lib/ripgrep` directly

- `ignore.ts` - exports `FileIgnore` from `@opendora/tools/filesystem/lib/ignore`
  - **Direct imports from @/file/ignore:** 0 files in opencode
  - **FileIgnore usage from @opendora/tools/filesystem/lib/ignore:** 2 files in opencode/tools
  - **Action:** Can be deleted immediately
  - **Replacement:** Use `@opendora/tools/filesystem/lib/ignore` directly

### tool/
Most tool files have NO direct imports from `@/tool/*` in opencode - they're imported directly from `@opendora/tools/*` packages.

**Can be deleted immediately (0 direct imports):**
- `agent-list.ts` - exports `AgentListTool` from `@opendora/tools/agents/agent-list`
- `agent-update.ts` - exports `AgentUpdateTool` from `@opendora/tools/agents/agent-update`
- `session-search.ts` - exports `SessionSearchTool` from `@opendora/tools/sessions`
- `bash.ts` - exports `BashTool` from `@opendora/tools/shell`
- `batch.ts` - exports `BatchTool` from `@opendora/tools/shell`
- `delegate.ts` - exports `DelegateTool` from `@opendora/tools/communication`
- `invalid.ts` - exports `InvalidTool` from `@opendora/tools/system`
- `lsp.ts` - exports `LspTool` from `@opendora/tools/system`
- `external-directory.ts` - exports `assertExternalDirectory` from `@opendora/tools/system`
- `codesearch.ts` - exports `CodeSearchTool` from `@opendora/tools/browse-and-web`
- `websearch.ts` - exports `WebSearchTool` from `@opendora/tools/browse-and-web`
- `agent-get.ts` - exports `AgentGetTool` from `@opendora/tools/agents/agent-get`
- `agent-create.ts` - exports `AgentCreateTool` from `@opendora/tools/agents/agent-create`
- `agent-delete.ts` - exports `AgentDeleteTool` from `@opendora/tools/agents/agent-delete`

**Require import updates before deletion:**
- `question.ts` - exports `QuestionTool` from `@opendora/tools/communication`
  - **Direct imports from @/tool/question:** 1 file in opencode
  - **Action:** Update 1 opencode import, then delete
  - **Replacement:** Use `@opendora/tools/communication` directly

- `task.ts` - exports `TaskTool` from `@opendora/tools/system`
  - **Direct imports from @/tool/task:** 2 files in opencode
  - **Action:** Update 2 opencode imports, then delete
  - **Replacement:** Use `@opendora/tools/system` directly

- `todo.ts` - exports `TodoWriteTool, TodoReadTool` from `@opendora/tools/system`
  - **Direct imports from @/tool/todo:** 1 file in opencode
  - **Action:** Update 1 opencode import, then delete
  - **Replacement:** Use `@opendora/tools/system` directly

- `webfetch.ts` - exports `WebFetchTool` from `@opendora/tools/browse-and-web`
  - **Direct imports from @/tool/webfetch:** 1 file in opencode
  - **Action:** Update 1 opencode import, then delete
  - **Replacement:** Use `@opendora/tools/browse-and-web` directly

## Summary

### Immediate Deletions (0 direct imports in opencode)
1. `bun/registry.ts`
2. `util/lock.ts`
3. `util/proxied.ts`
4. `shell/shell.ts`
5. `file/ignore.ts`
6. `tool/agent-list.ts`
7. `tool/agent-update.ts`
8. `tool/session-search.ts`
9. `tool/bash.ts`
10. `tool/batch.ts`
11. `tool/delegate.ts`
12. `tool/invalid.ts`
13. `tool/lsp.ts`
14. `tool/external-directory.ts`
15. `tool/codesearch.ts`
16. `tool/websearch.ts`
17. `tool/agent-get.ts`
18. `tool/agent-create.ts`
19. `tool/agent-delete.ts`

### Require Import Updates (total 37 files to update)
1. `flag/flag.ts` - 13 imports to update
2. `id/id.ts` - 1 import to update
3. `util/log.ts` - 6 imports to update
4. `util/process.ts` - 1 import to update
5. `util/glob.ts` - 3 imports to update
6. `util/filesystem.ts` - 10 imports to update
7. `bus/bus-event.ts` - 9 imports to update
8. `bus/global.ts` - 1 import to update
9. `file/ripgrep.ts` - 3 imports to update
10. `tool/question.ts` - 1 import to update
11. `tool/task.ts` - 2 imports to update
12. `tool/todo.ts` - 1 import to update
13. `tool/webfetch.ts` - 1 import to update

## Migration Steps

### Phase 1: Immediate Deletions
Delete the 19 files with 0 direct imports in opencode. These are already unused within the opencode package.

### Phase 2: Import Path Updates
For each file requiring updates:
1. Find all files importing from the re-export path
2. Replace import statement with direct import from source package
3. Run tests to verify
4. Delete the re-export file

### Phase 3: Verification
After all deletions:
1. Run full test suite
2. Check for any remaining import errors
3. Update any documentation that references the old paths

## Notes

- Some files like `tool/registry.ts` and `tool/tool.ts` have additional code beyond the single export line and are NOT included in this migration
- The reference map above shows both direct imports from the re-export path AND usage of the underlying export from its source package
- All replacements should use the exact source package path shown in each file's export statement
