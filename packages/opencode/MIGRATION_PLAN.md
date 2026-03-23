# OpenCode Package Migration Plan

## Executive Summary

This document outlines the strategy to migrate all functionality from `packages/opencode` into the proper package structure, ultimately eliminating the opencode package. The goal is to achieve a clean separation between:

- **Applications** (`apps/`): CLI, TUI, Web UI, API Server
- **Core Packages** (`packages/`): agents, providers, sessions, tools, skills
- **Supporting Packages**: util, permission, sdk, schedule, storage

---

## Current State Analysis

### OpenCode Package Structure (380 items in src/)

The `packages/opencode` currently contains a monolithic mix of:

1. **CLI/TUI Application Code** (~137 items in cli/)
2. **API Server Code** (~20 items in server/)
3. **Provider Implementations** (~31 items in provider/)
4. **Tool Implementations** (~59 items in tool/)
5. **Session Logic** (~32 items in session/)
6. **Agent Logic** (agent.ts + acp/)
7. **Skill Logic** (~3 items in skill/)
8. **Storage/Database** (~5 items in storage/)
9. **Utilities** (~26 items in util/)
10. **Infrastructure** (mcp, lsp, auth, config, etc.)

### Existing Target Packages

- **`@opendora/agent`**: Minimal, focused on file-based agent definitions
- **`@opendora/session`**: Well-structured session core (@pingpong/core)
- **`@opendora/tools`**: Organized tool implementations (filesystem, execution, etc.)
- **`@opendora/util`**: Shared utilities
- **`@opendora/permission`**: Permission system
- **`@opendora/sdk`**: SDK for external consumers

---

## Migration Strategy

### Phase 1: Create Application Structure (HIGHEST PRIORITY)

**Goal**: Extract all application-level code from opencode into `apps/` folder

#### 1.1 Create `apps/server` (API + CLI)
**Complexity**: HIGH | **Benefit**: CRITICAL | **Priority**: 1

**What moves here:**
- `/src/index.ts` - CLI entrypoint
- `/src/cli/` - All CLI commands and UI (137 items)
- `/src/server/` - API server routes and logic (20 items)
- `/bin/opencode` - Binary entrypoint
- `/src/installation/` - Installation logic
- `/src/global/` - Global paths and configuration

**Why this is critical:**
- Separates application runtime from library code
- Enables independent deployment of CLI vs API
- Clear boundary between consumer and provider code

**Dependencies to resolve:**
- Server depends on: providers, tools, sessions, agents, storage
- CLI depends on: all packages + TUI components

#### 1.2 Create `apps/tui` (Terminal UI)
**Complexity**: MEDIUM | **Benefit**: HIGH | **Priority**: 2

**What moves here:**
- TUI-specific CLI commands from `/src/cli/cmd/tui/`
- `/src/config/tui-schema.ts` and `/src/config/tui.ts`
- Any TUI rendering logic

**Rationale:**
- TUI is a separate frontend interface
- Can be developed/deployed independently
- Reduces CLI complexity

---

### Phase 2: Migrate Core Domain Logic to Packages

#### 2.1 Migrate to `@opendora/providers` (NEW PACKAGE)
**Complexity**: MEDIUM | **Benefit**: HIGH | **Priority**: 3

**What moves here:**
- `/src/provider/` - All provider implementations (31 items)
  - `provider.ts` - Core provider logic
  - `models.ts` - Model definitions
  - `models-snapshot.ts` - Model snapshots
  - `transform.ts` - Provider transformations
  - `auth.ts` - Provider authentication
  - `error.ts` - Provider errors
  - `/sdk/` - All AI SDK integrations (26 items)

**Package structure:**
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
│       ├── bedrock.ts
│       └── ... (all provider SDKs)
```

**Why separate package:**
- Providers are a distinct domain concern
- Can be versioned independently
- Reusable across different applications
- Clear API boundary

#### 2.2 Enhance `@opendora/tools`
**Complexity**: LOW | **Benefit**: HIGH | **Priority**: 4

**What moves here:**
- `/src/tool/` - Tool implementations (59 items)
  - Most tools are already just thin wrappers
  - Move actual implementations from opencode

**Current tools package already has:**
- filesystem/, agent-manager/, system/, task-management/, communication/, execution/

**What to add:**
- Implementations currently in opencode's tool/ directory
- Tool registry logic
- Tool execution framework

#### 2.3 Enhance `@opendora/session`
**Complexity**: MEDIUM | **Benefit**: MEDIUM | **Priority**: 5

**What moves here:**
- `/src/session/` - Session-specific logic (32 items)
  - `configure-session-core.ts` - Session configuration
  - `processor.ts` - Session processing
  - `instruction.ts` - Instruction handling
  - `prompt/` - Prompt templates (12 items)
  - `llm.ts` - LLM integration
  - `compaction.ts` - Message compaction
  - `summary.ts` - Session summarization

**Note:** The session package already has most core logic. This is about moving opencode-specific session orchestration.

#### 2.4 Enhance `@opendora/agent`
**Complexity**: LOW | **Benefit**: MEDIUM | **Priority**: 6

**What moves here:**
- `/src/agent.ts` - Agent runtime logic
- `/src/acp/` - Agent Client Protocol (4 items)
  - `agent.ts`, `session.ts`, `types.ts`

**Current agent package is minimal** - focused on templates. This adds runtime behavior.

#### 2.5 Create `@opendora/skills` (NEW PACKAGE)
**Complexity**: LOW | **Benefit**: MEDIUM | **Priority**: 7

**What moves here:**
- `/src/skill/` - Skill implementations (3 items)
  - `skill.ts` - Core skill logic
  - `discovery.ts` - Skill discovery
  - `index.ts` - Exports

**Package structure:**
```
packages/skills/
├── src/
│   ├── index.ts
│   ├── skill.ts
│   ├── discovery.ts
│   └── definitions/
│       └── ... (skill definitions)
```

---

### Phase 3: Infrastructure Packages

#### 3.1 Create `@opendora/mcp` (NEW PACKAGE - OPTIONAL)
**Complexity**: MEDIUM | **Benefit**: MEDIUM | **Priority**: 8

**What moves here:**
- `/src/mcp/` - Model Context Protocol (4 items)
  - `index.ts` - MCP server implementation
  - `auth.ts` - MCP authentication
  - `oauth-callback.ts` - OAuth callback handling
  - `oauth-provider.ts` - OAuth provider

**Rationale:**
- MCP is a distinct protocol/integration
- Could be used by tools or standalone
- You mentioned MCP might belong to tools or separate

**Decision needed:** Keep as separate package or merge into tools?

#### 3.2 Create `@opendora/storage` (NEW PACKAGE)
**Complexity**: HIGH | **Benefit**: HIGH | **Priority**: 9

**What moves here:**
- `/src/storage/` - Database and storage (5 items)
  - `db.ts` - Database client
  - `schema.sql.ts` - Database schema
  - `schema.ts` - Schema types
  - `storage.ts` - Storage abstraction
  - `json-migration.ts` - Migration logic
- `/src/control/` - Control tables (2 items)
- `/drizzle.config.ts` - Drizzle configuration
- `/migration/` - All database migrations

**Package structure:**
```
packages/storage/
├── src/
│   ├── index.ts
│   ├── client.ts
│   ├── schema/
│   │   ├── sessions.ts
│   │   ├── agents.ts
│   │   ├── control.ts
│   │   └── ...
│   ├── migrations/
│   └── adapters/
├── drizzle.config.ts
```

**Why separate:**
- Storage is shared infrastructure
- All packages need storage
- Centralized schema management
- Migration management

#### 3.3 Enhance `@opendora/util`
**Complexity**: LOW | **Benefit**: HIGH | **Priority**: 10

**What moves here:**
- `/src/util/` - Utility functions (26 items)
  - All utilities currently in opencode
  - Merge with existing util package

**Current opencode utils:**
- abort.ts, archive.ts, color.ts, context.ts, defer.ts, eventloop.ts
- filesystem.ts, fn.ts, format.ts, git.ts, glob.ts, iife.ts
- keybind.ts, lazy.ts, locale.ts, lock.ts, log.ts, process.ts
- proxied.ts, queue.ts, rpc.ts, scrap.ts, signal.ts, timeout.ts
- token.ts, wildcard.ts

---

### Phase 4: Remaining Infrastructure

#### 4.1 Handle Specialized Modules

**LSP (Language Server Protocol)** - `/src/lsp/` (4 items)
- **Option A**: Create `@opendora/lsp` package
- **Option B**: Move to tools package
- **Recommendation**: Separate package if used by multiple apps, otherwise tools

**File Operations** - `/src/file/` (5 items) + `/src/util/filesystem.ts`
- Move ALL to `@opendora/tools/filesystem`
- Includes:
  - From `/src/file/`: index.ts (file reading, listing, search), ripgrep.ts, ignore.ts, watcher.ts, time.ts
  - From `/src/util/`: filesystem.ts (I/O primitives: readText, write, exists, stat, etc.)
- **Rationale**: Eliminates artificial separation. All filesystem code belongs together in tools with clear internal organization (primitives vs operations)

**PTY (Pseudo-Terminal)** - `/src/pty/` (1 item)
- Move to `@opendora/tools/execution`

**Shell** - `/src/shell/` (1 item)
- Move to `@opendora/tools/execution`

**Project Management** - `/src/project/` (6 items)
- Move to `apps/server` (application-level concern)

**Scheduler** - `/src/scheduler/` (1 item)
- Already have `@opendora/schedule` package - move there

**Bus (Event Bus)** - `/src/bus/` (3 items)
- Move to `@opendora/util` or create `@opendora/events`

**Auth** - `/src/auth/` (2 items)
- Move to `apps/server` (application-level)

**Config** - `/src/config/` (6 items)
- Move to `apps/server` (application-level)

**Command** - `/src/command/` (3 items)
- Move to `apps/server` (CLI-specific)

**Format** - `/src/format/` (2 items)
- Move to `@opendora/util`

**Flag** - `/src/flag/` (1 item)
- Move to `apps/server` (CLI-specific)

**Question** - `/src/question/` (1 item)
- Move to `@opendora/tools/communication`

**Share** - `/src/share/` (2 items)
- Move to `apps/server` (application-level)

**Snapshot** - `/src/snapshot/` (1 item)
- Move to `@opendora/session` or `@opendora/db`

**Worktree** - `/src/worktree/` (1 item)
- Move to `@opendora/tools/filesystem`

**IDE** - `/src/ide/` (1 item)
- Move to `apps/server` (integration point)

**Env** - `/src/env/` (1 item)
- Move to `@opendora/util`

**ID** - `/src/id/` (1 item)
- Move to `@opendora/util`

**Patch** - `/src/patch/` (1 item)
- Move to `@opendora/tools/filesystem`

**Plugin** - `/src/plugin/` (3 items)
- Move to `apps/server` (application-level)

**Bun** - `/src/bun/` (2 items)
- Move to `apps/server` (runtime-specific)

**Permission** - `/src/permission/` (2 items)
- Already have `@opendora/permission` - move there

---

## Recommended Package Structure (Final State)

```
opendora/
├── apps/
│   ├── server/          # CLI + API Server
│   │   ├── src/
│   │   │   ├── cli/     # All CLI commands
│   │   │   ├── api/     # API routes
│   │   │   ├── config/  # Configuration
│   │   │   └── index.ts # Entrypoint
│   │   ├── bin/
│   │   └── package.json
│   ├── tui/             # Terminal UI (optional separate)
│   └── web/             # Next.js frontend (already exists)
│
├── packages/
│   ├── agents/          # Agent definitions & runtime
│   ├── providers/       # LLM provider integrations (NEW)
│   ├── sessions/        # Session management
│   ├── tools/           # Tool implementations
│   ├── skills/          # Skill definitions (NEW)
│   ├── storage/         # Database & storage (NEW)
│   ├── mcp/             # Model Context Protocol (NEW - OPTIONAL)
│   ├── util/            # Shared utilities
│   ├── permission/      # Permission system
│   ├── schedule/        # Scheduler
│   └── sdk/             # External SDK
```

---

## Migration Complexity Matrix

| Module | Target | Complexity | Dependencies | Priority | Benefit |
|--------|--------|------------|--------------|----------|---------|
| CLI | apps/server | HIGH | All packages | 1 | CRITICAL |
| Server | apps/server | HIGH | All packages | 1 | CRITICAL |
| Provider | packages/providers | MEDIUM | util, storage | 3 | HIGH |
| Tool | packages/tools | LOW | util, filesystem | 4 | HIGH |
| Session | packages/session | MEDIUM | storage, providers | 5 | MEDIUM |
| Agent | packages/agent | LOW | storage, session | 6 | MEDIUM |
| Skill | packages/skills | LOW | tools, agents | 7 | MEDIUM |
| MCP | packages/mcp | MEDIUM | tools, auth | 8 | MEDIUM |
| Storage | packages/storage | HIGH | None (base) | 9 | HIGH |
| Util | packages/util | LOW | None | 10 | HIGH |

---

## Migration Execution Plan

### Quick Wins (Start Here)

1. **Utilities** (Priority 10) - LOW complexity, HIGH benefit
   - Move `/src/util/` to `@opendora/util` (EXCEPT filesystem.ts)
   - Move `/src/id/`, `/src/env/`, `/src/format/`, `/src/bus/` to `@opendora/util`
   - filesystem.ts goes to tools (see step 3)
   - ~1-2 days

2. **Skills** (Priority 7) - LOW complexity, MEDIUM benefit
   - Create `@opendora/skills` package
   - Move `/src/skill/` (3 files)
   - ~1 day

3. **Tool Enhancements + Filesystem** (Priority 4) - MEDIUM complexity, HIGH benefit
   - Move tool implementations to `@opendora/tools`
   - **Merge ALL filesystem code into `@opendora/tools/filesystem`:**
     - `/src/file/` → `tools/filesystem/` (operations, ripgrep, ignore, watcher)
     - `/src/util/filesystem.ts` → `tools/filesystem/primitives.ts`
   - Move `/src/pty/`, `/src/shell/`, `/src/patch/`, `/src/worktree/` to `@opendora/tools`
   - ~3-5 days

### Medium Complexity

4. **Providers Package** (Priority 3) - MEDIUM complexity, HIGH benefit
   - Create `@opendora/providers` package
   - Move all provider code
   - ~3-5 days

5. **Session Enhancements** (Priority 5) - MEDIUM complexity, MEDIUM benefit
   - Move session orchestration to `@opendora/session`
   - ~2-3 days

6. **MCP Package** (Priority 8) - MEDIUM complexity, MEDIUM benefit
   - Create `@opendora/mcp` or merge to tools
   - ~2-3 days

### High Complexity (Save for Last)

7. **Storage Package** (Priority 9) - HIGH complexity, HIGH benefit
   - Create `@opendora/storage` package
   - Move all storage, schema, migrations
   - Update all packages to use new storage package
   - ~5-7 days

8. **Server Application** (Priority 1) - HIGH complexity, CRITICAL benefit
   - Create `apps/server`
   - Move CLI, API server, configuration
   - Wire up all package dependencies
   - ~7-10 days

---

## Dependency Resolution Strategy

### Circular Dependency Risks

**Current risks:**
- opencode → session → opencode (storage)
- opencode → tools → opencode (utilities)
- opencode → providers → opencode (config)

**Resolution:**
1. **Bottom-up migration**: Start with leaf packages (util, storage)
2. **Interface-first**: Define package interfaces before implementation
3. **Dependency injection**: Pass dependencies rather than importing

### Package Dependency Graph (Target)

```
apps/server
  ↓
├─ @opendora/agents
│    ↓
│  ├─ @opendora/session
│  │    ↓
│  │  ├─ @opendora/storage
│  │  │    ↓
│  │  │  └─ @opendora/util
│  │  └─ @opendora/util
│  └─ @opendora/storage
│
├─ @opendora/providers
│    ↓
│  ├─ @opendora/storage
│  └─ @opendora/util
│
├─ @opendora/tools
│    ↓
│  └─ @opendora/util
│
├─ @opendora/skills
│    ↓
│  ├─ @opendora/tools
│  └─ @opendora/agents
│
└─ @opendora/mcp
     ↓
   ├─ @opendora/tools
   └─ @opendora/util
```

---

## Testing Strategy

1. **Unit tests**: Each package has its own tests
2. **Integration tests**: Test package interactions
3. **E2E tests**: Test full application flows
4. **Migration validation**: Ensure no functionality is lost

### Test Migration Checklist

- [ ] Move tests with their modules
- [ ] Update test imports
- [ ] Verify all tests pass
- [ ] Add integration tests for new package boundaries
- [ ] Document test coverage gaps

---

## Rollout Strategy

### Option A: Big Bang (NOT RECOMMENDED)
- Migrate everything at once
- High risk, long development time
- Difficult to test incrementally

### Option B: Incremental (RECOMMENDED)
1. Create new packages alongside opencode
2. Migrate modules one at a time
3. Keep opencode as compatibility layer
4. Gradually deprecate opencode exports
5. Remove opencode when empty

### Incremental Steps

**Week 1-2: Foundation**
- Create package structure
- Move utilities
- Move skills

**Week 3-4: Core Packages**
- Create providers package
- Enhance tools package
- Enhance session package

**Week 5-6: Infrastructure**
- Create storage package
- Create mcp package (or merge to tools)
- Update all dependencies

**Week 7-8: Application Layer**
- Create apps/server
- Move CLI
- Move API server

**Week 9-10: Cleanup**
- Remove opencode package
- Update documentation
- Final testing

---

## Risk Assessment

### High Risks

1. **Breaking changes**: Existing code depends on opencode structure
   - **Mitigation**: Keep compatibility exports during transition

2. **Circular dependencies**: Packages may depend on each other
   - **Mitigation**: Careful dependency graph design, interfaces

3. **Storage migrations**: Moving schema may break existing data
   - **Mitigation**: Thorough migration testing, backup strategy

4. **Lost functionality**: Something gets missed in migration
   - **Mitigation**: Comprehensive test coverage, checklist

### Medium Risks

1. **Performance impact**: Additional package boundaries
   - **Mitigation**: Bundle optimization, tree-shaking

2. **Developer experience**: More complex to navigate
   - **Mitigation**: Clear documentation, good IDE support

3. **Build time**: More packages = more build steps
   - **Mitigation**: Parallel builds, caching

---

## Success Criteria

- [ ] All functionality from opencode is migrated
- [ ] All tests pass
- [ ] No circular dependencies
- [ ] Clear package boundaries
- [ ] Documentation updated
- [ ] CLI works identically
- [ ] API server works identically
- [ ] Performance is maintained or improved
- [ ] Developer experience is improved

---

## Next Steps

1. **Review this plan** with team
2. **Decide on package structure** (especially MCP placement)
3. **Create new package scaffolding**
4. **Start with quick wins** (util, skills)
5. **Iterate incrementally**
6. **Test continuously**
7. **Document as you go**

---

## Questions to Resolve

1. **MCP Package**: Separate package or merge into tools?
2. **TUI**: Separate app or part of server?
3. **LSP**: Separate package or merge into tools?
4. **Event Bus**: Separate package or merge into util?
5. **Migration timeline**: How aggressive should we be?
6. **Backward compatibility**: How long to maintain opencode exports?

---

## Estimated Timeline

**Conservative**: 10-12 weeks
**Aggressive**: 6-8 weeks
**Realistic**: 8-10 weeks

This assumes:
- 1-2 developers full-time
- Incremental approach
- Thorough testing
- Documentation updates
