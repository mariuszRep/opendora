# OpenCode Migration Execution Guide

This is a practical, step-by-step guide for executing the migration from `packages/opencode` to the new package structure.

---

## Pre-Migration Setup

### 1. Create Branch Strategy
```bash
git checkout -b migration/opencode-restructure
```

### 2. Backup Current State
```bash
# Create a backup branch
git checkout -b backup/pre-migration
git checkout migration/opencode-restructure
```

### 3. Set Up Testing Infrastructure
- Ensure all existing tests pass
- Document current test coverage
- Set up CI/CD for new packages

---

## Phase 1: Foundation Packages (Week 1-2)

### Step 1.1: Create `packages/util` Structure

**Goal**: Consolidate all utilities into a single package

```bash
# If util package doesn't exist, create it
mkdir -p packages/util/src
cd packages/util
```

**Create package.json:**
```json
{
  "name": "@opendora/util",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./filesystem": "./src/filesystem.ts",
    "./log": "./src/log.ts",
    "./process": "./src/process.ts",
    "./git": "./src/git.ts",
    "./glob": "./src/glob.ts",
    "./lock": "./src/lock.ts",
    "./queue": "./src/queue.ts",
    "./rpc": "./src/rpc.ts",
    "./abort": "./src/abort.ts",
    "./color": "./src/color.ts",
    "./format": "./src/format.ts",
    "./locale": "./src/locale.ts",
    "./keybind": "./src/keybind.ts"
  },
  "dependencies": {
    "zod": "catalog:"
  }
}
```

**Migration steps:**
1. Copy all files from `opencode/src/util/` to `util/src/` **EXCEPT filesystem.ts**
2. Copy files from `opencode/src/id/` to `util/src/`
3. Copy files from `opencode/src/env/` to `util/src/`
4. Copy files from `opencode/src/format/` to `util/src/`
5. Copy files from `opencode/src/bus/` to `util/src/`

**Note:** `/src/util/filesystem.ts` and `/src/file/` are NOT migrated here - they belong in `@opendora/tools/filesystem` (Phase 2) to keep all filesystem operations together.

**Update imports:**
```typescript
// Old
import { Log } from "../util/log"
import { Filesystem } from "../util/filesystem"

// New
import { Log } from "@opendora/util/log"
import { Filesystem } from "@opendora/util/filesystem"
```

**Test:**
```bash
cd packages/util
bun test
```

**Create compatibility layer in opencode:**
```typescript
// packages/opencode/src/util/log.ts
export * from "@opendora/util/log"
```

### Step 1.2: Create `packages/storage` Structure

**Goal**: Centralize all database and storage logic

```bash
mkdir -p packages/storage/src/{schema,migrations,adapters}
cd packages/storage
```

**Create package.json:**
```json
{
  "name": "@opendora/storage",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./storage": "./src/storage.ts",
    "./schema": "./src/schema/index.ts",
    "./migrations": "./src/migrations/index.ts"
  },
  "dependencies": {
    "@opendora/util": "workspace:*",
    "drizzle-orm": "1.0.0-beta.12-a5629fb",
    "zod": "catalog:"
  },
  "devDependencies": {
    "drizzle-kit": "1.0.0-beta.12-a5629fb"
  }
}
```

**Migration steps:**
1. Copy `opencode/src/storage/` to `storage/src/`
2. Copy `opencode/src/control/` to `storage/src/schema/control/`
3. Copy `opencode/drizzle.config.ts` to `storage/drizzle.config.ts`
4. Copy `opencode/migration/` to `storage/src/migrations/`
5. Update all schema imports across codebase

**Update drizzle.config.ts:**
```typescript
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/schema/**/*.sql.ts",
  out: "./src/migrations",
  dialect: "sqlite"
})
```

**Test:**
```bash
cd packages/storage
bun run db generate --name test
bun test
```

---

## Phase 2: Core Domain Packages (Week 3-4)

### Step 2.1: Create `packages/providers` Structure

```bash
mkdir -p packages/providers/src/sdk
cd packages/providers
```

**Create package.json:**
```json
{
  "name": "@opendora/providers",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./provider": "./src/provider.ts",
    "./models": "./src/models.ts",
    "./auth": "./src/auth.ts",
    "./transform": "./src/transform.ts",
    "./sdk/*": "./src/sdk/*.ts"
  },
  "dependencies": {
    "@opendora/util": "workspace:*",
    "@opendora/storage": "workspace:*",
    "@ai-sdk/anthropic": "2.0.65",
    "@ai-sdk/openai": "2.0.89",
    "ai": "catalog:",
    "zod": "catalog:"
  }
}
```

**Migration steps:**
1. Copy `opencode/src/provider/` to `providers/src/`
2. Update all imports to use `@opendora/util` and `@opendora/db`
3. Move tests
4. Update documentation

**Test:**
```bash
cd packages/providers
bun test
```

### Step 2.2: Create `packages/skills` Structure

```bash
mkdir -p packages/skills/src/definitions
cd packages/skills
```

**Create package.json:**
```json
{
  "name": "@opendora/skills",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./skill": "./src/skill.ts",
    "./discovery": "./src/discovery.ts"
  },
  "dependencies": {
    "@opendora/util": "workspace:*",
    "@opendora/tools": "workspace:*",
    "@opendora/agent": "workspace:*",
    "zod": "catalog:"
  }
}
```

**Migration steps:**
1. Copy `opencode/src/skill/` to `skills/src/`
2. Update imports
3. Move tests

**Test:**
```bash
cd packages/skills
bun test
```

### Step 2.3: Enhance `packages/tools`

**Migration steps:**
1. Copy all tool implementations from `opencode/src/tool/` to `tools/`
2. Organize by category:
   - `tools/filesystem/` - file operations
   - `tools/execution/` - bash, shell, pty
   - `tools/communication/` - question, delegation
   - `tools/agent-manager/` - agent CRUD
   - `tools/task-management/` - task, plan, todo
3. **Merge ALL filesystem code into `tools/filesystem/`** (IMPORTANT: All FS operations together)
   - `util/filesystem.ts` → `filesystem/primitives.ts` (readText, write, exists, stat, etc.)
   - `file/index.ts` → `filesystem/operations.ts` (file reading, listing, search, status)
   - `file/ripgrep.ts` → `filesystem/ripgrep.ts`
   - `file/ignore.ts` → `filesystem/ignore.ts`
   - `file/watcher.ts` → `filesystem/watcher.ts`
   - `file/time.ts` → `filesystem/time.ts`
   - Create `filesystem/index.ts` that exports everything
4. Copy `opencode/src/pty/` to `tools/execution/pty/`
5. Copy `opencode/src/shell/` to `tools/execution/shell/`
6. Copy `opencode/src/patch/` to `tools/filesystem/patch/`
7. Copy `opencode/src/worktree/` to `tools/filesystem/worktree/`
8. Copy `opencode/src/question/` to `tools/communication/question/`

**Update package.json exports:**
```json
{
  "exports": {
    "./filesystem": "./filesystem/index.ts",
    "./filesystem/primitives": "./filesystem/primitives.ts",
    "./filesystem/operations": "./filesystem/operations.ts",
    "./execution": "./execution/index.ts",
    "./communication": "./communication/index.ts",
    "./agent-manager": "./agent-manager/index.ts",
    "./task-management": "./task-management/index.ts",
    "./tool": "./tool.ts"
  }
}
```

**Rationale:** Eliminates artificial split between "low-level" and "high-level" filesystem operations. All filesystem code lives together with clear internal organization.

**Test:**
```bash
cd packages/tools
bun test
```

### Step 2.4: Enhance `packages/session`

**Migration steps:**
1. Copy `opencode/src/session/` files to `session/src/`
2. Merge with existing session package
3. Update imports to use new packages (@opendora/storage, @opendora/util)
4. Move prompt templates to `session/src/prompts/`

**Files to migrate:**
- `configure-session-core.ts`
- `processor.ts`
- `instruction.ts`
- `llm.ts`
- `compaction.ts`
- `summary.ts`
- `prompt/` directory

**Test:**
```bash
cd packages/session
bun test
```

### Step 2.5: Enhance `packages/agent`

**Migration steps:**
1. Copy `opencode/src/agent.ts` to `agent/src/runtime.ts`
2. Copy `opencode/src/acp/` to `agent/src/acp/`
3. Update imports

**Update package.json exports:**
```json
{
  "exports": {
    ".": "./src/index.ts",
    "./templates": "./src/templates/index.ts",
    "./runtime": "./src/runtime.ts",
    "./acp": "./src/acp/index.ts"
  }
}
```

**Test:**
```bash
cd packages/agent
bun test
```

---

## Phase 3: Optional Infrastructure Packages (Week 5)

### Step 3.1: Create `packages/mcp` (Optional)

**Decision point**: Separate package or merge into tools?

**If separate:**
```bash
mkdir -p packages/mcp/src
cd packages/mcp
```

**Create package.json:**
```json
{
  "name": "@opendora/mcp",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./server": "./src/server.ts",
    "./auth": "./src/auth.ts"
  },
  "dependencies": {
    "@opendora/util": "workspace:*",
    "@opendora/tools": "workspace:*",
    "@modelcontextprotocol/sdk": "1.25.2",
    "zod": "catalog:"
  }
}
```

**Migration steps:**
1. Copy `opencode/src/mcp/` to `mcp/src/`
2. Update imports
3. Move tests

**If merging into tools:**
```bash
mkdir -p packages/tools/mcp
cp -r packages/opencode/src/mcp/* packages/tools/mcp/
```

### Step 3.2: Handle LSP (Optional)

**Decision point**: Separate package or merge into tools?

**Recommendation**: Merge into tools unless heavily used

```bash
mkdir -p packages/tools/lsp
cp -r packages/opencode/src/lsp/* packages/tools/lsp/
```

---

## Phase 4: Application Layer (Week 6-8)

### Step 4.1: Create `apps/server` Structure

```bash
mkdir -p apps/server/src/{cli,api,config,auth,project}
cd apps/server
```

**Create package.json:**
```json
{
  "name": "@opendora/server",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "opendora": "./bin/opendora"
  },
  "scripts": {
    "dev": "bun run src/index.ts",
    "build": "bun build src/index.ts --outdir dist",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@opendora/agent": "workspace:*",
    "@opendora/providers": "workspace:*",
    "@opendora/session": "workspace:*",
    "@opendora/tools": "workspace:*",
    "@opendora/skills": "workspace:*",
    "@opendora/storage": "workspace:*",
    "@opendora/util": "workspace:*",
    "@opendora/permission": "workspace:*",
    "@opendora/schedule": "workspace:*",
    "yargs": "18.0.0",
    "hono": "catalog:",
    "zod": "catalog:"
  }
}
```

**Migration steps:**

1. **Copy CLI:**
   ```bash
   cp -r packages/opencode/src/cli/* apps/server/src/cli/
   cp -r packages/opencode/bin/* apps/server/bin/
   ```

2. **Copy Server:**
   ```bash
   cp -r packages/opencode/src/server/* apps/server/src/api/
   ```

3. **Copy Configuration:**
   ```bash
   cp -r packages/opencode/src/config/* apps/server/src/config/
   cp -r packages/opencode/src/global/* apps/server/src/global/
   cp -r packages/opencode/src/installation/* apps/server/src/installation/
   ```

4. **Copy Auth:**
   ```bash
   cp -r packages/opencode/src/auth/* apps/server/src/auth/
   ```

5. **Copy Project:**
   ```bash
   cp -r packages/opencode/src/project/* apps/server/src/project/
   ```

6. **Copy Other App-Level Code:**
   ```bash
   cp -r packages/opencode/src/command/* apps/server/src/command/
   cp -r packages/opencode/src/flag/* apps/server/src/flag/
   cp -r packages/opencode/src/share/* apps/server/src/share/
   cp -r packages/opencode/src/ide/* apps/server/src/ide/
   cp -r packages/opencode/src/plugin/* apps/server/src/plugin/
   cp -r packages/opencode/src/bun/* apps/server/src/bun/
   ```

7. **Copy Main Entrypoint:**
   ```bash
   cp packages/opencode/src/index.ts apps/server/src/index.ts
   ```

8. **Update ALL imports in apps/server:**
   ```typescript
   // Old
   import { Provider } from "../provider/provider"
   import { Tool } from "../tool/tool"
   import { Session } from "../session"
   import { Database } from "../storage/db"
   
   // New
   import { Provider } from "@opendora/providers"
   import { Tool } from "@opendora/tools"
   import { Session } from "@opendora/session"
   import { Database } from "@opendora/storage"
   ```

9. **Update bin script:**
   ```bash
   #!/usr/bin/env bun
   import "../src/index.ts"
   ```

**Test:**
```bash
cd apps/server
bun run dev
bun test
```

### Step 4.2: Test Full Application

**Run all commands:**
```bash
# Test CLI
./apps/server/bin/opendora --help
./apps/server/bin/opendora run "test"
./apps/server/bin/opendora serve

# Test API
curl http://localhost:3000/health
```

---

## Phase 5: Cleanup (Week 9-10)

### Step 5.1: Remove Compatibility Layers

**For each migrated module:**
1. Remove re-export from opencode
2. Update any remaining imports
3. Run tests

### Step 5.2: Delete OpenCode Package

**Only after everything is migrated and tested:**

```bash
# Verify no imports from opencode
grep -r "from.*opencode" packages/ apps/

# If clean, remove
rm -rf packages/opencode

# Update workspace config
# Remove opencode from package.json workspaces
```

### Step 5.3: Update Documentation

1. Update README files
2. Update SCOPE.md, STATE.md, ROADMAP.md
3. Update AGENTS.md
4. Create migration guide for external users

### Step 5.4: Final Testing

```bash
# Run all tests
bun test

# Build all packages
bun run build

# Test CLI
opendora --version
opendora run "test"

# Test API
bun run apps/server/src/index.ts serve
```

---

## Migration Checklist

### Pre-Migration
- [ ] Create migration branch
- [ ] Create backup branch
- [ ] Document current state
- [ ] All tests passing
- [ ] CI/CD configured

### Phase 1: Foundation
- [ ] Create/enhance `packages/util`
- [ ] Migrate all utilities
- [ ] Create `packages/storage`
- [ ] Migrate storage and schema
- [ ] All tests passing

### Phase 2: Core Packages
- [ ] Create `packages/providers`
- [ ] Migrate provider code
- [ ] Create `packages/skills`
- [ ] Migrate skill code
- [ ] Enhance `packages/tools`
- [ ] Migrate tool implementations
- [ ] Enhance `packages/session`
- [ ] Migrate session orchestration
- [ ] Enhance `packages/agent`
- [ ] Migrate agent runtime
- [ ] All tests passing

### Phase 3: Infrastructure
- [ ] Create `packages/storage`
- [ ] Migrate storage, schema, migrations
- [ ] Decide on MCP package structure
- [ ] Migrate MCP code
- [ ] Decide on LSP package structure
- [ ] Migrate LSP code
- [ ] All tests passing

### Phase 4: Application
- [ ] Create `apps/server` structure
- [ ] Migrate CLI code
- [ ] Migrate API server code
- [ ] Migrate configuration
- [ ] Migrate auth
- [ ] Migrate project management
- [ ] Update all imports
- [ ] All tests passing
- [ ] CLI works
- [ ] API works

### Phase 5: Cleanup
- [ ] Remove compatibility layers
- [ ] Delete opencode package
- [ ] Update documentation
- [ ] Final testing
- [ ] Code review
- [ ] Merge to main

---

## Troubleshooting

### Issue: Circular Dependencies

**Symptom**: Build fails with circular dependency error

**Solution**:
1. Identify the cycle using build output
2. Extract shared types to a separate file
3. Use dependency injection instead of direct imports
4. Consider if packages are properly separated

### Issue: Import Errors

**Symptom**: Cannot find module errors

**Solution**:
1. Check package.json exports
2. Verify workspace dependencies
3. Run `bun install` in workspace root
4. Check tsconfig.json paths

### Issue: Tests Failing

**Symptom**: Tests that passed before now fail

**Solution**:
1. Update test imports
2. Check for missing dependencies
3. Verify test data paths
4. Check for environment-specific code

### Issue: Build Performance

**Symptom**: Build takes too long

**Solution**:
1. Enable parallel builds
2. Use build caching
3. Optimize tsconfig.json
4. Consider using turborepo

---

## Rollback Plan

If migration needs to be rolled back:

```bash
# Switch back to backup branch
git checkout backup/pre-migration

# Or revert specific commits
git revert <commit-hash>

# Or reset to before migration
git reset --hard <commit-before-migration>
```

---

## Success Metrics

- [ ] All 380+ files migrated
- [ ] Zero files remaining in opencode/src
- [ ] All tests passing (100% of original tests)
- [ ] CLI functionality identical
- [ ] API functionality identical
- [ ] Build time acceptable (<5min)
- [ ] No circular dependencies
- [ ] Documentation complete
- [ ] Team trained on new structure

---

## Timeline Estimate

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Foundation | 1-2 weeks | 40-80 hours |
| Phase 2: Core Packages | 2-3 weeks | 80-120 hours |
| Phase 3: Infrastructure | 1 week | 40 hours |
| Phase 4: Application | 2-3 weeks | 80-120 hours |
| Phase 5: Cleanup | 1-2 weeks | 40-80 hours |
| **Total** | **8-10 weeks** | **280-440 hours** |

With 2 developers: 4-5 weeks
With 1 developer: 8-10 weeks

---

## Next Steps

1. Review this guide with the team
2. Make decisions on optional packages (MCP, LSP)
3. Set up migration branch
4. Start with Phase 1 (Foundation)
5. Test continuously
6. Document as you go
