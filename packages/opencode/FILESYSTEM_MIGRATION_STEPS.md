# Filesystem Migration - Step-by-Step Execution Plan

## Status: Ready to Execute

Based on analysis in `FILESYSTEM_MIGRATION_ANALYSIS.md`, here's the concrete execution plan.

---

## ✅ Phase 1: Remove Duplicates (IMMEDIATE - 30 min)

### Step 1.1: Verify and Remove `util/filesystem.ts`
**Status:** Ready
**Files:** 28 imports to update

```bash
# Files importing from util/filesystem:
- acp/agent.ts
- auth/index.ts
- bun/index.ts
- cli/cmd/agent.ts
- cli/cmd/github.ts
- cli/cmd/import.ts
- cli/cmd/mcp.ts
- cli/cmd/run.ts
- cli/cmd/session.ts
- cli/cmd/tui/util/clipboard.ts
- cli/cmd/uninstall.ts
- config/markdown.ts
- file/index.ts
- file/ripgrep.ts
- file/time.ts
- format/formatter.ts
- global/index.ts
- index.ts
- lsp/client.ts
- lsp/server.ts
- mcp/auth.ts
- project/project.ts
- provider/models.ts
- provider/provider.ts
- skill/discovery.ts
- storage/json-migration.ts
- storage/storage.ts
- tool/truncation.ts
```

**Actions:**
1. Create re-export in opencode: `src/util/filesystem.ts` → `export * from "@opendora/tools/lib/filesystem"`
2. Test that all imports still work
3. Later: Update all imports to use `@opendora/tools/lib/filesystem` directly

### Step 1.2: Remove `patch/index.ts`
**Status:** Ready

**Current usage:**
- `tool/apply_patch.ts` - Uses `../patch`

**Actions:**
1. Update `tool/apply_patch.ts` to import from `@opendora/tools/lib/patch`
2. Delete `src/patch/` folder

### Step 1.3: Handle `file/time.ts` Difference
**Status:** Needs decision

**Issue:** Opencode version has project-specific features:
- `Instance.state()` for per-session tracking
- `Log` for logging
- `Flag.OPENCODE_DISABLE_FILETIME_CHECK` feature flag

**Options:**
- A: Keep opencode version for now (application-level concern)
- B: Enhance tools version with optional callbacks
- C: Use tools version, add session tracking in opencode wrapper

**Recommendation:** Option A - Keep in opencode for now (not a blocker)

---

## 🔴 Phase 2: Migrate Ripgrep (HIGH PRIORITY - 3-4 hours)

### Step 2.1: Move `file/ripgrep.ts` → `tools/lib/ripgrep.ts`

**Current dependencies:**
```typescript
import { Global } from "../global"           // ❌ Application concern
import { Filesystem } from "../util/filesystem" // ✅ Already in tools
import { Process } from "../util/process"     // ✅ Already in tools
import { lazy } from "../util/lazy"           // ❌ Need to copy
import { Log } from "@/util/log"              // ❌ Application concern
```

**Actions:**
1. Copy `util/lazy.ts` → `tools/lib/lazy.ts`
2. Copy `file/ripgrep.ts` → `tools/lib/ripgrep.ts`
3. Update imports:
   - Remove `Global` dependency - pass binary path as parameter
   - Remove `Log` dependency - use console or noop
   - Update `Filesystem`, `Process` imports to local
4. Update `host.ts` to wire up ripgrep implementation
5. Test grep and ls tools

**Binary path solution:**
```typescript
// In tools/lib/ripgrep.ts
export namespace Ripgrep {
  let binaryPath: string | undefined
  
  export function setBinaryPath(path: string) {
    binaryPath = path
  }
  
  async function getBinaryPath(): Promise<string> {
    if (binaryPath) return path.join(binaryPath, "rg" + ...)
    // Fallback to system rg
    return Bun.which("rg") || downloadRipgrep()
  }
}

// In opencode initialization
import { Ripgrep } from "@opendora/tools/lib/ripgrep"
import { Global } from "./global"
Ripgrep.setBinaryPath(Global.Path.bin)
```

### Step 2.2: Wire Ripgrep to Host Services

**Update `host.ts`:**
```typescript
// Already has interface, just need implementation
export interface HostServices {
  ripgrep?: {
    search(args: string[], options?: { cwd?: string }): Promise<RipgrepSearchResult[]>
    glob(pattern: string, options?: RipgrepGlobOptions): Promise<string[]>
    files(options?: { cwd?: string; follow?: boolean; hidden?: boolean; signal?: AbortSignal }): AsyncIterable<string>
  }
}
```

**In opencode server initialization:**
```typescript
import { Ripgrep } from "@opendora/tools/lib/ripgrep"

const hostServices: HostServices = {
  ripgrep: {
    async search(args, options) {
      return Ripgrep.search({ pattern: args[0], cwd: options?.cwd || "." })
    },
    async glob(pattern, options) {
      const results = []
      for await (const file of Ripgrep.files({ cwd: options?.cwd || "." })) {
        if (matchesGlob(file, pattern)) results.push(file)
      }
      return results
    },
    files(options) {
      return Ripgrep.files(options || {})
    }
  }
}
```

---

## 🟡 Phase 3: Migrate File Operations (HIGH PRIORITY - 6-8 hours)

### Step 3.1: Move `file/ignore.ts` → `tools/lib/ignore.ts`

**Current state:**
- `file/ignore.ts` - Comprehensive ignore patterns
- `tools/filesystem/ls.ts` - Has `IGNORE_PATTERNS` array

**Actions:**
1. Copy `file/ignore.ts` → `tools/lib/ignore.ts`
2. Update imports (only depends on `util/glob` which is already in tools)
3. Update `ls.ts` to use `FileIgnore.match()` instead of inline patterns
4. Test ls tool

### Step 3.2: Refactor `file/index.ts` → `tools/lib/file-operations.ts`

**Challenge:** Heavy dependencies on application concerns:
```typescript
import { BusEvent } from "@/bus/bus-event"     // ❌ Event system
import { Instance } from "../project/instance" // ❌ Project context
import { Global } from "../global"             // ❌ Global paths
```

**Strategy:** Extract pure file operations, inject context via host services

**New structure:**
```typescript
// tools/lib/file-operations.ts
export namespace FileOperations {
  export interface Context {
    directory: string
    worktree: string
    containsPath: (path: string) => boolean
  }
  
  export async function read(filepath: string, ctx: Context): Promise<FileContent> {
    // Pure logic without Instance/Global dependencies
  }
  
  export async function list(dir: string, ctx: Context): Promise<FileNode[]> {
    // Pure logic
  }
  
  export async function search(query: string, ctx: Context): Promise<string[]> {
    // Pure logic
  }
  
  export async function status(ctx: Context): Promise<FileInfo[]> {
    // Git status logic
  }
}
```

**In opencode - create wrapper:**
```typescript
// opencode/src/file/index.ts (becomes thin wrapper)
import { FileOperations } from "@opendora/tools/lib/file-operations"
import { Instance } from "../project/instance"

export namespace File {
  export async function read(file: string) {
    return FileOperations.read(file, {
      directory: Instance.directory,
      worktree: Instance.worktree,
      containsPath: Instance.containsPath
    })
  }
  // ... other wrappers
}
```

**Actions:**
1. Create `tools/lib/file-operations.ts` with pure functions
2. Update `file/index.ts` to be a thin wrapper
3. Test server routes that use File operations

---

## 🟢 Phase 4: Migrate Worktree (MEDIUM PRIORITY - 2-3 hours)

### Step 4.1: Analyze Worktree Usage

**First:** Find all usages of `worktree/index.ts`

```bash
grep -r "from.*worktree" packages/opencode/src --include="*.ts"
```

### Step 4.2: Move `worktree/index.ts` → `tools/lib/worktree.ts`

**Actions:**
1. Analyze dependencies
2. Extract pure worktree logic
3. Move to tools/lib
4. Update imports

---

## 🔵 Phase 5: Handle File Watcher (LOW PRIORITY - 1-2 hours)

### Step 5.1: Move `file/watcher.ts` → `apps/server/src/infrastructure/watcher.ts`

**Rationale:**
- Uses Bus, Instance, Config, Flag - all application concerns
- Not used by agent tools
- Server infrastructure

**Actions:**
1. Create `apps/server/src/infrastructure/` directory
2. Move `file/watcher.ts` → `infrastructure/watcher.ts`
3. Update imports in server initialization
4. Update `file/ignore.ts` import

---

## 📋 Phase 6: Cleanup (FINAL - 3-4 hours)

### Step 6.1: Update All Imports

**Create script to update imports:**
```bash
# Replace util/filesystem imports
find packages/opencode/src -name "*.ts" -exec sed -i 's|from "../util/filesystem"|from "@opendora/tools/lib/filesystem"|g' {} \;
find packages/opencode/src -name "*.ts" -exec sed -i 's|from "../../util/filesystem"|from "@opendora/tools/lib/filesystem"|g' {} \;

# Replace file/ imports
find packages/opencode/src -name "*.ts" -exec sed -i 's|from "../file/ripgrep"|from "@opendora/tools/lib/ripgrep"|g' {} \;
```

### Step 6.2: Delete Migrated Folders

**Only after all imports updated and tested:**
```bash
rm -rf packages/opencode/src/patch/
rm packages/opencode/src/util/filesystem.ts
# Keep file/ folder for now (has wrappers)
```

### Step 6.3: Update Package Dependencies

**In `packages/tools/package.json`:**
```json
{
  "dependencies": {
    "diff": "catalog:",
    "glob": "13.0.5",
    "mime-types": "3.0.2",
    "minimatch": "10.0.3",
    "fuzzysort": "^3.0.0",        // ADD
    "ignore": "^6.0.0",            // ADD
    "@zip.js/zip.js": "^2.7.0",   // ADD (for ripgrep Windows)
    "zod": "catalog:"
  }
}
```

### Step 6.4: Final Testing

**Test all filesystem operations:**
```bash
# Test tools directly
bun test packages/tools/

# Test opencode integration
bun run dev:ui
# Test in UI:
# - Read file
# - Write file
# - Edit file
# - List directory
# - Search files
# - Grep content
```

---

## Execution Order

### Week 1 - Core Migration
- [ ] Day 1: Phase 1 (Remove duplicates) + Start Phase 2 (Ripgrep)
- [ ] Day 2: Complete Phase 2 (Ripgrep) + Test
- [ ] Day 3: Phase 3 (File operations) - Extract pure logic
- [ ] Day 4: Phase 3 (File operations) - Create wrappers + Test
- [ ] Day 5: Phase 4 (Worktree) + Phase 5 (Watcher)

### Week 2 - Cleanup & Testing
- [ ] Day 1: Phase 6 (Update imports)
- [ ] Day 2: Phase 6 (Delete folders, update deps)
- [ ] Day 3: Phase 6 (Final testing)
- [ ] Day 4: Buffer for issues
- [ ] Day 5: Documentation updates

---

## Risk Mitigation

### Backup Strategy
```bash
# Before starting
git checkout -b filesystem-migration-backup
git checkout -b filesystem-migration-work
```

### Testing Strategy
1. Run existing tests after each phase
2. Manual testing of UI after major changes
3. Keep compatibility wrappers until final cleanup

### Rollback Plan
- Keep compatibility re-exports until Phase 6
- Can revert individual phases if issues arise
- Full backup branch available

---

## Success Criteria

- [ ] All filesystem code consolidated in `packages/tools`
- [ ] No duplicate code between opencode and tools
- [ ] All tests passing
- [ ] UI functionality unchanged
- [ ] Clean import paths
- [ ] Documentation updated
- [ ] Migration documents archived

---

## Next Action

**Ready to start?** Begin with Phase 1, Step 1.1:

```bash
# Create compatibility re-export
echo 'export * from "@opendora/tools/lib/filesystem"' > packages/opencode/src/util/filesystem.ts
```

Then test that everything still works before proceeding.
