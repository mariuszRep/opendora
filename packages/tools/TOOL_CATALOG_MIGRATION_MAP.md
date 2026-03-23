# Tools Catalog Migration Map

This document maps the current `packages/opencode/src/tool` surface to `packages/tools`, then groups the related functionality that still needs to move or be formalized so tools become self-contained catalogs.

## What Is Already True

- Every current `packages/opencode/src/tool/*.ts` module already has a basename match in `packages/tools`.
- `opencode/src/tool/*` is mostly a thin compatibility layer now.
- The remaining migration work is not "copy more tool files". The real work is moving or formalizing the runtime services and helper modules each tool family depends on.

## Current Shape

### Direct tool catalogs already present in `packages/tools`

- `filesystem`
  - `apply_patch`, `codesearch`, `edit`, `glob`, `grep`, `ls`, `multiedit`, `read`, `write`
- `execution`
  - `bash`, `batch`
- `communication`
  - `question`, `webfetch`, `websearch`
- `delegation`
  - `delegate`, `reply`, `session-get`, `session-search`, `session-tree`
- `agent-manager`
  - `agent-create`, `agent-delete`, `agent-get`, `agent-list`, `agent-update`
- `task-management`
  - `plan`, `task`, `todo`, plus delegation helpers
- `system`
  - `invalid`, `lsp`, `skill`, `registry`, `external-directory`, `log-lesson`

### Tool-local infrastructure already present in `packages/tools`

- `tool.ts`
- `host.ts`
- `truncation.ts`
- `lib/abort.ts`
- `lib/file-time.ts`
- `lib/filesystem.ts`
- `lib/glob.ts`
- `lib/identifier.ts`
- `lib/patch.ts`
- `lib/process.ts`

## Important Finding

The natural grouping line is not just "which tools look similar". It is "which tools depend on the same host services and helper stack".

That host/service boundary is now the main source of coupling.

## Host-Service Dependency Map

### Filesystem catalog

Tools:

- `read`
- `ls`
- `glob`
- `grep`
- `edit`
- `write`
- `apply_patch`
- `multiedit`
- `codesearch`

Shared internals:

- `lib/filesystem.ts`
- `lib/file-time.ts`
- `lib/patch.ts`
- `lib/process.ts`
- `system/external-directory.ts`

Host/runtime dependencies:

- required: `directory`, `worktree`
- optional or tool-specific: `ripgrep`, `lsp`, `containsPath`, `allowedPaths`, `disableFiletimeCheck`

Natural grouping:

- This is already a coherent catalog.
- `external-directory.ts` belongs with this family more than with generic `system`.
- `lsp` is only an enhancer here, not the primary boundary.

### Execution catalog

Tools:

- `bash`
- `batch`

Shared internals:

- `lib/filesystem.ts`
- `lib/identifier.ts`

Host/runtime dependencies:

- required: `directory`
- optional: `shell`, `emit`

Natural grouping:

- Strong standalone catalog.
- If shell execution policy becomes more complex, move policy helpers here rather than leaving them in app/session code.

### Discovery and web catalog

Tools:

- `question`
- `webfetch`
- `websearch`
- `codesearch` can also be argued into this family if you want "information retrieval" instead of "filesystem"

Shared internals:

- `lib/abort.ts`

Host/runtime dependencies:

- `question` needs `question`
- `webfetch` and `websearch` are mostly self-contained today

Natural grouping:

- Good UI-facing catalog for "ask / fetch / search".
- If the UI wants end-user categories, this is a better label than raw `communication`.

### Session and delegation catalog

Tools:

- `delegate`
- `reply`
- `session-get`
- `session-search`
- `session-tree`

Shared internals:

- `task-management/delegation.ts`

Host/runtime dependencies:

- `session`
- `prompt`
- `promptCancel`
- `resolvePromptParts`
- `question`
- `agents`

Natural grouping:

- This is the strongest hidden cluster in the whole package.
- `delegate` and the session inspection tools all hang off the same session runtime.
- These should be grouped as one catalog for UI and ownership purposes even if you keep multiple folders internally.

Recommendation:

- Treat `delegation/` and the session inspection tools as one domain.
- `task.ts` is legacy and should live in `core` for now.
- `plan.ts` belongs in `core`.

### Todo and planning catalog

Tools:

- `todo`

Host/runtime dependencies:

- `todo`

Natural grouping:

- `todo` is much lighter-weight than the rest of `task-management`.
- It is a real candidate to split from the orchestration family.

### Agent admin catalog

Tools:

- `agent-create`
- `agent-update`
- `agent-delete`
- `agent-list`
- `agent-get`

Host/runtime dependencies:

- `agents`

Natural grouping:

- Very strong self-contained admin catalog.
- Good candidate for a UI "agent management" section with minimal extra coupling.

### Skills catalog

Tools:

- `skill_discover`
- `skill_load`

Host/runtime dependencies:

- `skills`
- `ripgrep`

Correlation outside `tools`:

- `opencode/src/skill/*`
- permission behavior previously tied to `PermissionNext`

Natural grouping:

- This is a distinct catalog and also a signal that `packages/skills` should exist or become a first-class dependency.
- These tools should not remain half-owned by `opencode`.

### LSP catalog

Tools:

- `lsp`

Host/runtime dependencies:

- `lsp`
- `directory`
- `worktree`

Natural grouping:

- This is specialized enough to stand alone.
- It can remain a one-tool catalog or be folded into the broader `filesystem` catalog later.

## What Still Lives Conceptually In OpenCode

These are the pieces that indicate migration is incomplete even though tool files were copied:

### Registry wiring still depends on OpenCode runtime

`opencode/src/tool/registry.ts` still configures:

- flags from `config/flag`
- plugin loading from `plugin`
- directories from `config`
- truncation via `Truncate.output`
- worktree/directory via `project/instance`

Meaning:

- `packages/tools` owns tool composition.
- `opencode` still owns tool runtime assembly.
- That is acceptable short term, but it means the real boundary is "tools + host adapter", not tools alone.

### Truncation policy still belongs to OpenCode

`packages/tools/truncation.ts` is only a configurable shell.

Actual implementation remains effectively in:

- `opencode/src/tool/truncation.ts`

And that implementation depends on:

- `global`
- `id`
- `permission`
- `scheduler`
- filesystem/glob utilities

Meaning:

- Tool output storage and cleanup policy is still an app/runtime concern.
- If you want catalogs to be fully portable, this policy either moves into `tools` or into a dedicated shared runtime package.

### Skill discovery and loading still point back to OpenCode-owned domain concepts

The old implementation referenced:

- `opencode/src/skill`
- `permission/next`
- `file/ripgrep`

The new implementation improved this by injecting `skills` and `ripgrep`, but the actual skill domain still needs to be owned outside `opencode`.

### Session workflow tools need a formal session host contract

The most coupled family is the session/delegation cluster. It currently assumes session APIs such as:

- `list`
- `children`
- `messages`
- `get`
- `getMessage`
- `create`
- `ensureMainSession`
- `setSpawnResponseMessageID`
- `setReplyToMessageID`
- `reply`
- `pong`

Meaning:

- These tools are portable only if the session host contract is treated as a real API, not as incidental wiring from `configure-session-core.ts`.

## Recommended Catalog Model

For actual migration and future UI exposure, I would group the package like this:

### 1. `filesystem`

Includes:

- `read`, `ls`, `glob`, `grep`, `edit`, `write`, `multiedit`, `apply_patch`

Bring with it:

- `lib/filesystem.ts`
- `lib/file-time.ts`
- `lib/patch.ts`
- `lib/process.ts`
- `external-directory.ts`

Why:

- These tools share the same path-safety, filesystem mutation, and file-state logic.

### 2. `filesystem`

Includes:

- `codesearch`
- `lsp`

Bring with it:

- ripgrep-backed search access
- LSP host adapter

Why:

- Both are read-oriented code understanding tools.
- This is a better mental model for UI than scattering them between filesystem and system.

Why:

- These are read-oriented code understanding tools and fit naturally under the broader filesystem/code-access surface.

Note:

- If you want a single exported catalog, merge this with the previous filesystem group.
- If you want sub-groups inside the catalog, use:
  - `filesystem/files`
  - `filesystem/intelligence`

### 3. `shell`

Includes:

- `bash`
- `batch`

Bring with it:

- execution policy helpers
- shell host adapter

Why:

- Clear operational boundary and permission model.

### 4. `web`

Includes:

- `question`
- `webfetch`
- `websearch`

Why:

- User interaction and external information retrieval fit together well in UI and agent prompting.

### 5. `sessions`

Includes:

- `delegate`
- `reply`
- `session-get`
- `session-search`
- `session-tree`

Bring with it:

- `task-management/delegation.ts`
- the formal session/prompt host contract

Why:

- This is one runtime domain, not two.
- Splitting `delegation` from `task-management` hides the true dependency structure.

### 6. `agents`

Includes:

- `agent-create`, `agent-update`, `agent-delete`, `agent-list`, `agent-get`

Why:

- Clean API surface, minimal coupling.

### 7. `skills`

Includes:

- `skill_discover`
- `skill_load`

Bring with it:

- a real `skills` package or equivalent domain owner

Why:

- Natural independent catalog and a strong UI section.

### 8. `core`

Includes:

- `todo`
- `plan`
- `task`
- `tool.ts`
- `host.ts`
- `registry.ts`
- `truncation.ts`
- `invalid.ts`

Why:

- These are framework pieces plus lightweight coordination tools.
- `todo` and `plan` fit better here if you want them treated as core control-flow rather than session workflow.
- `task` is legacy and should stay in `core` until it is removed or redesigned.

## Migration Rules Of Thumb

Use these rules to decide what else must move out of `opencode` when migrating a tool family:

- If a tool imports a helper under `packages/tools/lib`, keep that helper with the same catalog unless it is clearly generic.
- If a tool needs a host service, define that service as part of the catalog contract instead of letting `configure-session-core.ts` be the undocumented source of truth.
- If multiple tools need the same host service and lifecycle semantics, they belong in the same catalog even if they currently sit in different folders.
- If a tool references an `opencode` domain module only through host injection now, the next migration target is that domain package, not the tool file itself.

## Concrete Move List

To make `packages/tools` the real owner of "everything that belongs to tools", the next moves should be:

1. Formalize catalog ownership around host contracts.
   - Split `host.ts` into typed service contracts per catalog or at least document them by domain.

2. Merge `delegation` and the session inspection tools into one catalog.
   - The current folder split does not reflect runtime reality.

3. Move `external-directory.ts` under the filesystem catalog.
   - It is filesystem policy, not general system infrastructure.

4. Decide where truncation policy lives.
   - Either move the implementation from `opencode/src/tool/truncation.ts` into `packages/tools`, or create a shared runtime package and keep `tools` consuming it.

5. Extract the skill domain fully out of `opencode`.
   - `skill_load` and `skill_discover` are already tool-owned; the backing skill system should be too.

6. Promote the session tool host API to a first-class interface.
   - That is the main prerequisite for making the `sessions` catalog portable and easy for LLMs to reason about.

## Short Version

If the goal is "self-contained functionality that is intuitive for LLMs and easy to expose in UI", the best grouping is:

- `filesystem`
- `shell`
- `web`
- `sessions`
- `agents`
- `skills`
- `core`

The main correction to the current structure is this:

- `delegation` and the session-heavy part of `task-management` are not separate domains in practice.
- `task` is legacy and should live in `core` for now.
- `filesystem` should absorb both `external-directory` policy and code-understanding tools.
- `system` is currently a catch-all and should shrink to framework concerns only.
- `todo` and `plan` should live in `core`.
