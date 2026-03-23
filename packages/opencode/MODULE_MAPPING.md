# OpenCode Module-by-Module Migration Mapping

This document provides a detailed breakdown of every module in `packages/opencode/src/` and where it should migrate.

---

## Module Inventory & Migration Targets

### 🎯 Application Layer (→ `apps/server`)

#### `/src/index.ts` → `apps/server/src/index.ts`
- **Type**: CLI Entrypoint
- **Size**: 213 lines
- **Dependencies**: All packages
- **Complexity**: HIGH
- **Notes**: Main CLI orchestration, yargs setup, command registration

#### `/src/cli/` (137 items) → `apps/server/src/cli/`
- **Type**: CLI Commands & UI
- **Complexity**: HIGH
- **Files**:
  - `bootstrap.ts` - CLI initialization
  - `error.ts` - Error formatting
  - `logo.ts` - ASCII logo
  - `network.ts` - Network utilities
  - `ui.ts` - CLI UI components
  - `upgrade.ts` - Upgrade logic
  - `cmd/` - All command implementations:
    - `run.ts`, `generate.ts`, `auth.ts`, `agent.ts`
    - `upgrade.ts`, `uninstall.ts`, `models.ts`
    - `serve.ts`, `workspace-serve.ts`, `debug.ts`
    - `stats.ts`, `mcp.ts`, `github.ts`, `export.ts`
    - `import.ts`, `pr.ts`, `session.ts`, `db.ts`
    - `hello.ts`, `web.ts`, `acp.ts`
    - `tui/` - TUI commands (attach.ts, thread.ts)

#### `/src/server/` (20 items) → `apps/server/src/api/`
- **Type**: API Server
- **Complexity**: HIGH
- **Files**:
  - `server.ts` - Main server implementation (27,535 bytes)
  - `error.ts` - Error handling
  - `event.ts` - Server events
  - `mdns.ts` - mDNS discovery
  - `routes/` - API route handlers (16 items)

#### `/src/config/` (6 items) → `apps/server/src/config/`
- **Type**: Configuration Management
- **Complexity**: MEDIUM
- **Files**:
  - `config.ts` - Main config
  - `markdown.ts` - Markdown config
  - `migrate-tui-config.ts` - TUI config migration
  - `paths.ts` - Path configuration
  - `tui-schema.ts` - TUI schema
  - `tui.ts` - TUI config

#### `/src/global/` (1 item) → `apps/server/src/global/`
- **Type**: Global State
- **Complexity**: LOW
- **Files**: `index.ts` - Global paths and state

#### `/src/installation/` (1 item) → `apps/server/src/installation/`
- **Type**: Installation Logic
- **Complexity**: LOW
- **Files**: `index.ts` - Installation utilities

#### `/src/auth/` (2 items) → `apps/server/src/auth/`
- **Type**: Authentication
- **Complexity**: MEDIUM
- **Files**:
  - `index.ts` - Auth logic
  - `registration.ts` - Registration

#### `/src/project/` (6 items) → `apps/server/src/project/`
- **Type**: Project Management
- **Complexity**: MEDIUM
- **Files**: Project-level orchestration

#### `/src/command/` (3 items) → `apps/server/src/command/`
- **Type**: Command Utilities
- **Complexity**: LOW
- **Files**: `index.ts` - Command helpers

#### `/src/flag/` (1 item) → `apps/server/src/flag/`
- **Type**: CLI Flags
- **Complexity**: LOW
- **Files**: `flag.ts` - Flag parsing

#### `/src/share/` (2 items) → `apps/server/src/share/`
- **Type**: Sharing Features
- **Complexity**: LOW
- **Files**: Share/export functionality

#### `/src/ide/` (1 item) → `apps/server/src/ide/`
- **Type**: IDE Integration
- **Complexity**: LOW
- **Files**: `index.ts` - IDE integration points

#### `/src/plugin/` (3 items) → `apps/server/src/plugin/`
- **Type**: Plugin System
- **Complexity**: MEDIUM
- **Files**: Plugin loading and management

#### `/src/bun/` (2 items) → `apps/server/src/bun/`
- **Type**: Bun Runtime
- **Complexity**: LOW
- **Files**:
  - `index.ts` - Bun utilities
  - `registry.ts` - Bun registry

---

### 📦 Core Packages

#### `/src/provider/` (31 items) → `packages/providers/` (NEW PACKAGE)
- **Type**: LLM Provider Integrations
- **Complexity**: MEDIUM
- **Priority**: HIGH
- **Files**:
  - `provider.ts` (49,045 bytes) - Core provider logic
  - `models.ts` (3,920 bytes) - Model definitions
  - `models-snapshot.ts` (1,626,359 bytes) - Model snapshots
  - `transform.ts` (31,747 bytes) - Provider transformations
  - `auth.ts` (3,929 bytes) - Provider auth
  - `error.ts` (6,008 bytes) - Provider errors
  - `sdk/` (26 items) - All AI SDK integrations:
    - Anthropic, OpenAI, Bedrock, Azure, Cerebras
    - Cohere, DeepInfra, Google, Vertex, Groq
    - Mistral, Perplexity, TogetherAI, XAI, etc.

**Package Structure:**
```
packages/providers/
├── src/
│   ├── index.ts
│   ├── provider.ts
│   ├── models.ts
│   ├── auth.ts
│   ├── error.ts
│   ├── transform.ts
│   └── sdk/
│       ├── anthropic.ts
│       ├── openai.ts
│       └── ... (all providers)
├── package.json
└── tsconfig.json
```

#### `/src/tool/` (59 items) → `packages/tools/`
- **Type**: Tool Implementations
- **Complexity**: LOW-MEDIUM
- **Priority**: HIGH
- **Current tools package structure**: Already organized
- **What to migrate**:
  - Tool registry (`registry.ts`)
  - Tool definitions (all .ts files)
  - Tool prompts (all .txt files)
  - Tool execution logic (`skill.ts`, `truncation.ts`)

**Tools to migrate:**
- `agent-create.ts`, `agent-delete.ts`, `agent-get.ts`, `agent-list.ts`, `agent-update.ts`
- `apply_patch.ts`, `bash.ts`, `batch.ts`, `codesearch.ts`
- `delegate.ts`, `delegation.ts`, `edit.ts`, `external-directory.ts`
- `glob.ts`, `grep.ts`, `invalid.ts`, `ls.ts`, `lsp.ts`
- `multiedit.ts`, `plan.ts`, `question.ts`, `read.ts`
- `session-search.ts`, `skill.ts`, `task.ts`, `todo.ts`
- `webfetch.ts`, `websearch.ts`, `write.ts`

#### `/src/session/` (32 items) → `packages/session/`
- **Type**: Session Orchestration
- **Complexity**: MEDIUM
- **Priority**: MEDIUM
- **Note**: Session package already has core logic, this adds orchestration

**Files to migrate:**
- `configure-session-core.ts` (9,738 bytes) - Session configuration
- `processor.ts` - Session processing
- `instruction.ts` - Instruction handling
- `llm.ts` - LLM integration
- `compaction.ts` - Message compaction
- `summary.ts` - Session summarization
- `prompt/` (12 items) - Prompt templates
- `bus-bridge.ts` - Event bus bridge
- `events.ts` - Session events
- `message.ts`, `message-v2.ts` - Message types
- `retry.ts`, `revert.ts`, `status.ts`, `system.ts`

#### `/src/agent.ts` + `/src/acp/` (4 items) → `packages/agent/`
- **Type**: Agent Runtime
- **Complexity**: LOW-MEDIUM
- **Priority**: MEDIUM

**Files:**
- `agent.ts` (9,202 bytes) - Agent runtime logic
- `acp/agent.ts` - ACP agent implementation
- `acp/session.ts` - ACP session handling
- `acp/types.ts` - ACP types

#### `/src/skill/` (3 items) → `packages/skills/` (NEW PACKAGE)
- **Type**: Skill Definitions
- **Complexity**: LOW
- **Priority**: MEDIUM

**Files:**
- `skill.ts` (5,701 bytes) - Core skill logic
- `discovery.ts` (2,801 bytes) - Skill discovery
- `index.ts` (24 bytes) - Exports

**Package Structure:**
```
packages/skills/
├── src/
│   ├── index.ts
│   ├── skill.ts
│   ├── discovery.ts
│   └── definitions/
│       └── ... (future skill definitions)
├── package.json
└── tsconfig.json
```

---

### 🔧 Infrastructure Packages

#### `/src/storage/` (5 items) + `/src/control/` (2 items) → `packages/storage/` (NEW PACKAGE)
- **Type**: Database & Storage
- **Complexity**: HIGH
- **Priority**: HIGH
- **Critical**: Foundation for all other packages

**Files:**
- `storage/db.ts` (4,426 bytes) - Database client
- `storage/schema.sql.ts` (230 bytes) - SQL schema
- `storage/schema.ts` (332 bytes) - Schema types
- `storage/storage.ts` (7,590 bytes) - Storage abstraction
- `storage/json-migration.ts` (14,506 bytes) - JSON→SQLite migration
- `control/control.sql.ts` (174 bytes) - Control tables
- `control/index.ts` - Control logic

**Also migrate:**
- `/drizzle.config.ts` - Drizzle configuration
- `/migration/` (12 items) - All database migrations

**Package Structure:**
```
packages/storage/
├── src/
│   ├── index.ts
│   ├── client.ts
│   ├── storage.ts
│   ├── schema/
│   │   ├── sessions.ts
│   │   ├── agents.ts
│   │   ├── control.ts
│   │   └── index.ts
│   ├── migrations/
│   │   └── ... (all migrations)
│   └── adapters/
│       └── json-migration.ts
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

#### `/src/mcp/` (4 items) → `packages/mcp/` (NEW PACKAGE) OR `packages/tools/mcp/`
- **Type**: Model Context Protocol
- **Complexity**: MEDIUM
- **Priority**: MEDIUM
- **Decision needed**: Separate package or merge into tools?

**Files:**
- `index.ts` (29,976 bytes) - MCP server implementation
- `auth.ts` (4,232 bytes) - MCP authentication
- `oauth-callback.ts` (6,221 bytes) - OAuth callback
- `oauth-provider.ts` (5,426 bytes) - OAuth provider

**Recommendation**: Keep as separate package initially, can merge later if needed.

**Package Structure (if separate):**
```
packages/mcp/
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── auth.ts
│   ├── oauth-callback.ts
│   └── oauth-provider.ts
├── package.json
└── tsconfig.json
```

#### `/src/lsp/` (4 items) → `packages/lsp/` (NEW PACKAGE) OR `packages/tools/lsp/`
- **Type**: Language Server Protocol
- **Complexity**: MEDIUM
- **Priority**: LOW
- **Decision needed**: Separate package or merge into tools?

**Files:**
- `client.ts` - LSP client
- `index.ts` - LSP exports
- `language.ts` - Language support
- `server.ts` - LSP server

**Recommendation**: Merge into tools unless used by multiple apps.

#### `/src/util/` (25 items) → `packages/util/`
- **Type**: Shared Utilities
- **Complexity**: LOW
- **Priority**: HIGH (Foundation)

**Files to migrate:**
- `abort.ts` (1,160 bytes) - Abort utilities
- `archive.ts` (673 bytes) - Archive utilities
- `color.ts` (598 bytes) - Color utilities
- `context.ts` (588 bytes) - Context management
- `defer.ts` (328 bytes) - Deferred promises
- `eventloop.ts` (570 bytes) - Event loop utilities
- `fn.ts` (321 bytes) - Function utilities
- `format.ts` (675 bytes) - Formatting utilities
- `git.ts` (888 bytes) - Git utilities
- `glob.ts` (951 bytes) - Glob utilities
- `iife.ts` (55 bytes) - IIFE helper
- `keybind.ts` (2,704 bytes) - Keybinding utilities
- `lazy.ts` (410 bytes) - Lazy evaluation
- `locale.ts` (2,469 bytes) - Locale utilities
- `lock.ts` (2,276 bytes) - Lock utilities
- `log.ts` (5,040 bytes) - Logging utilities
- `process.ts` (3,405 bytes) - Process utilities
- `proxied.ts` (146 bytes) - Proxy utilities
- `queue.ts` (844 bytes) - Queue utilities
- `rpc.ts` (2,080 bytes) - RPC utilities
- `scrap.ts` (222 bytes) - Scratchpad utilities
- `signal.ts` (202 bytes) - Signal utilities
- `timeout.ts` (385 bytes) - Timeout utilities
- `token.ts` (179 bytes) - Token utilities
- `wildcard.ts` (2,074 bytes) - Wildcard matching

**Note:** `filesystem.ts` is NOT migrated here - it belongs with `/src/file/` in `@opendora/tools/filesystem`

#### `/src/file/` (5 items) + `/src/util/filesystem.ts` → `packages/tools/filesystem/`
- **Type**: All Filesystem Operations (Primitives + Agent Operations)
- **Complexity**: MEDIUM
- **Priority**: HIGH

**Files from `/src/file/`:**
- `index.ts` (647 lines) - File reading with git diff, directory listing, file search, status tracking
- `ripgrep.ts` (373 lines) - Ripgrep wrapper for file searching
- `ignore.ts` (83 lines) - File ignore patterns (node_modules, .git, etc.)
- `watcher.ts` (129 lines) - File system watching (Parcel watcher)
- `time.ts` - File timestamp utilities

**Files from `/src/util/`:**
- `filesystem.ts` (190 lines) - Basic I/O primitives (readText, write, exists, stat, etc.)

**Target structure:**
```
tools/filesystem/
├── primitives.ts      (util/filesystem.ts)
├── operations.ts      (file/index.ts)
├── ripgrep.ts
├── ignore.ts
├── watcher.ts
├── time.ts
└── index.ts
```

**Rationale**: Eliminates artificial separation between "low-level" and "high-level" filesystem operations. All filesystem code lives together in tools, with clear internal organization.

#### `/src/format/` (2 items) → `packages/util/`
- **Type**: Formatting
- **Complexity**: LOW
- **Files**:
  - `formatter.ts` - Formatter
  - `index.ts` - Exports

#### `/src/env/` (1 item) → `packages/util/`
- **Type**: Environment Variables
- **Complexity**: LOW
- **Files**: `index.ts` - Environment utilities

#### `/src/id/` (1 item) → `packages/util/`
- **Type**: ID Generation
- **Complexity**: LOW
- **Files**: `id.ts` - ID utilities

#### `/src/bus/` (3 items) → `packages/util/` OR `packages/events/` (NEW)
- **Type**: Event Bus
- **Complexity**: LOW-MEDIUM
- **Decision needed**: Merge into util or create separate events package?

**Files:**
- `bus-event.ts` - Event types
- `global.ts` - Global bus
- `index.ts` - Exports

**Recommendation**: Merge into util unless event system grows significantly.

---

### 🔌 Specialized Modules

#### `/src/pty/` (1 item) → `packages/tools/execution/`
- **Type**: Pseudo-Terminal
- **Complexity**: LOW
- **Files**: PTY utilities

#### `/src/shell/` (1 item) → `packages/tools/execution/`
- **Type**: Shell Execution
- **Complexity**: LOW
- **Files**: Shell utilities

#### `/src/patch/` (1 item) → `packages/tools/filesystem/`
- **Type**: Patch Operations
- **Complexity**: LOW
- **Files**: `index.ts` - Patch utilities

#### `/src/worktree/` (1 item) → `packages/tools/filesystem/`
- **Type**: Git Worktree
- **Complexity**: LOW
- **Files**: Worktree utilities

#### `/src/question/` (1 item) → `packages/tools/communication/`
- **Type**: User Questions
- **Complexity**: LOW
- **Files**: Question utilities

#### `/src/snapshot/` (1 item) → `packages/session/` OR `packages/storage/`
- **Type**: Session Snapshots
- **Complexity**: LOW
- **Files**: Snapshot utilities

#### `/src/scheduler/` (1 item) → `packages/schedule/`
- **Type**: Task Scheduling
- **Complexity**: LOW
- **Files**: Scheduler utilities
- **Note**: Package already exists

#### `/src/permission/` (2 items) → `packages/permission/`
- **Type**: Permission System
- **Complexity**: LOW
- **Files**: Permission logic
- **Note**: Package already exists

---

## Migration Order by Dependency

### Level 0: No Dependencies (Start Here)
1. **`/src/util/`** → `packages/util/`
2. **`/src/id/`** → `packages/util/`
3. **`/src/env/`** → `packages/util/`
4. **`/src/format/`** → `packages/util/`

### Level 1: Depends on Level 0
5. **`/src/storage/`** → `packages/storage/`
6. **`/src/bus/`** → `packages/util/`

### Level 2: Depends on Level 0-1
7. **`/src/file/`** → `packages/tools/filesystem/`
8. **`/src/provider/`** → `packages/providers/`
9. **`/src/skill/`** → `packages/skills/`
10. **`/src/pty/`, `/src/shell/`, `/src/patch/`, `/src/worktree/`** → `packages/tools/`

### Level 3: Depends on Level 0-2
11. **`/src/tool/`** → `packages/tools/`
12. **`/src/session/`** → `packages/session/`
13. **`/src/agent.ts`, `/src/acp/`** → `packages/agent/`
14. **`/src/mcp/`** → `packages/mcp/`
15. **`/src/lsp/`** → `packages/lsp/` or `packages/tools/lsp/`

### Level 4: Application Layer (Last)
16. **`/src/server/`** → `apps/server/src/api/`
17. **`/src/cli/`** → `apps/server/src/cli/`
18. **`/src/config/`, `/src/auth/`, `/src/project/`** → `apps/server/src/`
19. **`/src/index.ts`** → `apps/server/src/index.ts`

---

## File Count Summary

| Category | Files | Target | Priority |
|----------|-------|--------|----------|
| CLI/TUI | ~137 | apps/server | HIGH |
| Server/API | ~20 | apps/server | HIGH |
| Provider | ~31 | packages/providers | HIGH |
| Tool | ~59 | packages/tools | HIGH |
| Session | ~32 | packages/session | MEDIUM |
| Storage | ~7 | packages/storage | HIGH |
| Util | ~26 | packages/util | HIGH |
| Agent/ACP | ~5 | packages/agent | MEDIUM |
| Skill | ~3 | packages/skills | MEDIUM |
| MCP | ~4 | packages/mcp | MEDIUM |
| LSP | ~4 | packages/lsp | LOW |
| Config | ~6 | apps/server | MEDIUM |
| Other | ~46 | Various | LOW-MEDIUM |
| **TOTAL** | **~380** | | |

---

## Quick Reference: Where Does X Go?

| If it's... | It goes to... |
|------------|---------------|
| CLI command | `apps/server/src/cli/` |
| API route | `apps/server/src/api/` |
| LLM provider | `packages/providers/` |
| Tool implementation | `packages/tools/` |
| Session logic | `packages/session/` |
| Agent logic | `packages/agent/` |
| Skill definition | `packages/skills/` |
| Database/storage | `packages/storage/` |
| Utility function | `packages/util/` |
| MCP server | `packages/mcp/` (or tools) |
| LSP server | `packages/lsp/` (or tools) |
| Configuration | `apps/server/src/config/` |
| Authentication | `apps/server/src/auth/` |
| Project management | `apps/server/src/project/` |

---

## Migration Checklist Template

For each module:
- [ ] Identify all dependencies
- [ ] Create target package/directory
- [ ] Copy files to new location
- [ ] Update imports in moved files
- [ ] Update imports in files that reference moved files
- [ ] Move tests
- [ ] Update test imports
- [ ] Run tests
- [ ] Update documentation
- [ ] Add compatibility exports in opencode (temporary)
- [ ] Mark as migrated

---

## Notes

- **Total files to migrate**: ~380
- **Estimated effort**: 8-10 weeks with 1-2 developers
- **Biggest challenges**: 
  - CLI/Server migration (most dependencies)
  - Storage migration (affects everything)
  - Provider migration (large files)
- **Quick wins**: 
  - Utilities (no dependencies)
  - Skills (small, self-contained)
  - Tool enhancements (mostly wrappers)
