# Filesystem Migration Analysis

## Current State Assessment

### ✅ Already Migrated to `packages/tools`

#### `tools/lib/filesystem.ts` (190 lines)
**Status:** ✅ COMPLETE - Identical to `opencode/src/util/filesystem.ts`

**Contents:**
- Basic I/O: `readText`, `readBytes`, `readJson`, `write`, `writeJson`, `writeStream`
- File checks: `exists`, `isDir`, `stat`, `size`
- Path utilities: `contains`, `overlaps`, `normalizePath`, `windowsPath`
- Search utilities: `findUp`, `up`, `globUp`
- MIME type detection

**Used by:** All filesystem tools (read, write, edit, grep, glob, etc.)

#### `tools/lib/patch.ts` (681 lines)
**Status:** ✅ COMPLETE - Patch parsing and application logic

**Contents:**
- Patch schema definitions
- Hunk types (add, delete, update)
- Patch parsing from unified diff format
- Patch application logic

**Used by:** `apply_patch.ts` tool

#### `tools/lib/glob.ts` (951 bytes)
**Status:** ✅ COMPLETE - Glob pattern matching

**Contents:**
- Glob pattern scanning
- File/directory filtering
- Pattern matching utilities

**Used by:** `glob.ts` tool, `filesystem.ts` (globUp)

#### `tools/lib/file-time.ts` (2020 bytes)
**Status:** ✅ COMPLETE - File timestamp utilities

**Contents:**
- File modification time tracking
- Time-based file validation
- Timestamp formatting

**Used by:** `read.ts`, `write.ts`, `edit.ts` tools

#### `tools/lib/process.ts` (3405 bytes)
**Status:** ✅ COMPLETE - Process spawning utilities

**Contents:**
- Process spawning with proper signal handling
- Stream management
- Exit code handling

**Used by:** `grep.ts` tool (for ripgrep execution)

#### `tools/filesystem/` (20 files)
**Status:** ✅ COMPLETE - All filesystem tools implemented

**Tools:**
- `read.ts` - Read files with line offset/limit
- `write.ts` - Write files with diagnostics
- `edit.ts` - Edit files with old/new string replacement
- `multiedit.ts` - Multiple edits in one file
- `apply_patch.ts` - Apply unified diff patches
- `ls.ts` - List directory contents
- `glob.ts` - Find files by glob pattern
- `grep.ts` - Search file contents
- `codesearch.ts` - Semantic code search (Exa API)

---

## 🔴 Still in OpenCode - Needs Migration

### 1. `/src/file/` (5 files, ~35KB)

#### `file/index.ts` (647 lines, 16.7KB)
**Purpose:** High-level file operations with git integration

**Key functionality:**
- `File.read()` - Read file with git diff, binary detection, image handling
- `File.list()` - List directory with gitignore support
- `File.search()` - Fuzzy file search with hidden file handling
- `File.status()` - Git status (added/modified/deleted files)
- File type detection (binary, text, image)
- MIME type handling
- Base64 encoding for images

**Dependencies:**
- `@/bus/bus-event` - Event system
- `../util/filesystem` - Basic I/O
- `../project/instance` - Project context
- `./ripgrep` - File listing
- `fuzzysort` - Fuzzy search
- `ignore` - Gitignore parsing
- `diff` - Patch generation

**Used by:**
- `tool/read.ts` (indirectly via server routes)
- `server/routes/file.ts`
- `cli/cmd/debug/file.ts`
- `format/index.ts`

**Migration target:** `tools/filesystem/operations.ts` + `tools/lib/file-operations.ts`

#### `file/ripgrep.ts` (373 lines, 10.7KB)
**Purpose:** Ripgrep binary management and wrapper

**Key functionality:**
- `Ripgrep.filepath()` - Get/download ripgrep binary
- `Ripgrep.files()` - List files (async generator)
- `Ripgrep.tree()` - Generate directory tree
- `Ripgrep.search()` - Search file contents
- Platform-specific binary download (GitHub releases)
- Binary extraction (tar.gz, zip)

**Dependencies:**
- `../global` - Global paths
- `../util/filesystem` - File operations
- `../util/process` - Process spawning
- `../util/lazy` - Lazy initialization
- `@zip.js/zip.js` - ZIP extraction (Windows)

**Used by:**
- `file/index.ts` - File listing
- `tool/grep.ts` (indirectly via host.ripgrep)
- `cli/cmd/debug/ripgrep.ts`

**Migration target:** `tools/lib/ripgrep.ts`

**Note:** `host.ts` already has ripgrep interface - need to wire this implementation

#### `file/ignore.ts` (83 lines, 1.4KB)
**Purpose:** File ignore patterns

**Key functionality:**
- `FileIgnore.PATTERNS` - Default ignore patterns
- `FileIgnore.match()` - Check if file should be ignored
- Folder patterns (node_modules, .git, dist, etc.)
- File patterns (*.log, *.swp, etc.)

**Dependencies:**
- `../util/glob` - Glob matching

**Used by:**
- `file/watcher.ts` - File watching
- Potentially other file operations

**Migration target:** `tools/lib/ignore.ts` or merge into `tools/filesystem/ls.ts` (which has IGNORE_PATTERNS)

#### `file/watcher.ts` (129 lines, 4.3KB)
**Purpose:** File system watching

**Key functionality:**
- `FileWatcher.init()` - Initialize file watcher
- Watch project directory for changes
- Watch .git directory for VCS changes
- Emit events on file add/change/unlink
- Platform-specific backends (fs-events, inotify, windows)

**Dependencies:**
- `@/bus` - Event bus
- `../project/instance` - Project context
- `../util/log` - Logging
- `./ignore` - Ignore patterns
- `../config/config` - Configuration
- `@parcel/watcher` - File watching library
- `../flag/flag` - Feature flags

**Used by:**
- Project initialization
- Server startup

**Migration target:** `tools/lib/watcher.ts` or `apps/server` (application-level concern)

**Decision needed:** Is file watching a tool or application-level infrastructure?

#### `file/time.ts` (2410 bytes)
**Purpose:** File time utilities

**Status:** ⚠️ DUPLICATE - `tools/lib/file-time.ts` already exists (2020 bytes)

**Action:** Compare and merge if different, otherwise delete opencode version

---

### 2. `/src/patch/` (1 file, ~20KB)

#### `patch/index.ts` (20,772 bytes)
**Purpose:** Patch parsing and application

**Status:** ⚠️ DUPLICATE - `tools/lib/patch.ts` already exists (20,736 bytes)

**Action:** Compare implementations and consolidate

---

### 3. `/src/worktree/` (1 file, ~19KB)

#### `worktree/index.ts` (19,224 bytes)
**Purpose:** Git worktree management

**Key functionality:**
- Create temporary git worktrees
- Manage worktree lifecycle
- Clean up worktrees
- Worktree-based operations

**Dependencies:**
- Git operations
- File system operations

**Used by:**
- Unknown - need to check usage

**Migration target:** `tools/lib/worktree.ts` or `tools/execution/worktree.ts`

**Decision needed:** Is this a filesystem concern or execution concern?

---

### 4. `/src/pty/` (1 file)

#### `pty/index.ts`
**Purpose:** Pseudo-terminal operations

**Migration target:** `tools/execution/pty/` (already planned in migration docs)

---

### 5. `/src/shell/` (1 file)

#### `shell/index.ts`
**Purpose:** Shell execution

**Migration target:** `tools/execution/shell/` (already planned in migration docs)

---

## Migration Strategy

### Phase 1: Consolidate Duplicates (IMMEDIATE)

1. **Compare and merge `file/time.ts` with `tools/lib/file-time.ts`**
   - If identical: delete opencode version
   - If different: merge functionality

2. **Compare and merge `patch/index.ts` with `tools/lib/patch.ts`**
   - If identical: delete opencode version
   - If different: merge functionality

### Phase 2: Migrate Core File Operations (HIGH PRIORITY)

3. **Migrate `file/ripgrep.ts` → `tools/lib/ripgrep.ts`**
   - Move ripgrep binary management
   - Wire up to `host.ts` ripgrep interface
   - Update imports in opencode

4. **Migrate `file/ignore.ts` → `tools/lib/ignore.ts`**
   - Consolidate with `tools/filesystem/ls.ts` IGNORE_PATTERNS
   - Create unified ignore pattern system

5. **Migrate `file/index.ts` → `tools/lib/file-operations.ts`**
   - Extract git-aware file operations
   - Keep project-agnostic where possible
   - May need to inject project context via host services

### Phase 3: Migrate Specialized Modules (MEDIUM PRIORITY)

6. **Migrate `worktree/index.ts` → `tools/lib/worktree.ts`**
   - Git worktree management
   - Used by specific workflows

7. **Decide on `file/watcher.ts`**
   - Option A: `tools/lib/watcher.ts` (if tools need it)
   - Option B: `apps/server/src/watcher/` (if application-level)
   - Recommendation: Application-level (server concern)

### Phase 4: Update OpenCode Imports (FINAL)

8. **Update all imports in opencode**
   - Replace `../file/` imports with `@opendora/tools/...`
   - Replace `../util/filesystem` imports with `@opendora/tools/lib/filesystem`
   - Replace `../patch/` imports with `@opendora/tools/lib/patch`

9. **Delete migrated folders from opencode**
   - Remove `/src/file/`
   - Remove `/src/patch/`
   - Remove `/src/worktree/`
   - Remove `filesystem.ts` from `/src/util/`

---

## Dependency Graph

```
tools/filesystem/
├── read.ts
│   └── lib/filesystem.ts ✅
│   └── lib/file-time.ts ✅
├── write.ts
│   └── lib/filesystem.ts ✅
│   └── lib/file-time.ts ✅
├── edit.ts
│   └── lib/filesystem.ts ✅
│   └── lib/file-time.ts ✅
├── apply_patch.ts
│   └── lib/patch.ts ✅
│   └── lib/filesystem.ts ✅
├── ls.ts
│   └── host.ripgrep ⚠️ (needs file/ripgrep.ts)
├── glob.ts
│   └── lib/glob.ts ✅
│   └── lib/filesystem.ts ✅
├── grep.ts
│   └── lib/filesystem.ts ✅
│   └── lib/process.ts ✅
│   └── host.ripgrep ⚠️ (needs file/ripgrep.ts)

opencode/src/file/
├── index.ts
│   └── ripgrep.ts 🔴
│   └── util/filesystem ✅ (already in tools)
│   └── project/instance 🔴 (needs host services)
│   └── bus/bus-event 🔴 (application concern)
├── ripgrep.ts 🔴
│   └── util/filesystem ✅
│   └── util/process ✅
│   └── global 🔴 (application concern)
├── ignore.ts 🔴
│   └── util/glob ✅
├── watcher.ts 🔴
│   └── bus 🔴
│   └── project/instance 🔴
│   └── config 🔴
│   └── ignore.ts 🔴
```

---

## Key Decisions Needed

### 1. File Watcher Location
**Question:** Should `file/watcher.ts` be in tools or apps/server?

**Analysis:**
- Uses project context, config, event bus
- Not directly used by agent tools
- Infrastructure for server

**Recommendation:** `apps/server/src/infrastructure/watcher.ts`

### 2. File Operations with Project Context
**Question:** How to handle `file/index.ts` which depends on `Instance` (project context)?

**Options:**
- A: Inject project context via `host.ts` services
- B: Keep in opencode as application-level
- C: Create project-aware wrapper in opencode that uses tools

**Recommendation:** Option A - Extend `host.ts` with file operation services

### 3. Ripgrep Binary Management
**Question:** Where should ripgrep binary download/management live?

**Analysis:**
- Currently in `file/ripgrep.ts`
- Used by tools (grep, ls)
- Needs global path for binary storage

**Recommendation:** `tools/lib/ripgrep.ts` with binary path injected via host

---

## Implementation Checklist

### Immediate Actions
- [ ] Compare `file/time.ts` with `tools/lib/file-time.ts`
- [ ] Compare `patch/index.ts` with `tools/lib/patch.ts`
- [ ] Identify actual usage of `worktree/index.ts`

### Migration Tasks
- [ ] Move `file/ripgrep.ts` → `tools/lib/ripgrep.ts`
- [ ] Move `file/ignore.ts` → `tools/lib/ignore.ts`
- [ ] Refactor `file/index.ts` → `tools/lib/file-operations.ts`
- [ ] Move `worktree/index.ts` → `tools/lib/worktree.ts`
- [ ] Move `file/watcher.ts` → `apps/server/src/infrastructure/watcher.ts`

### Integration Tasks
- [ ] Wire ripgrep to `host.ts`
- [ ] Extend `host.ts` with file operation services
- [ ] Update all opencode imports
- [ ] Test all filesystem tools
- [ ] Delete migrated folders from opencode

---

## Estimated Effort

| Task | Complexity | Time | Priority |
|------|-----------|------|----------|
| Compare duplicates | LOW | 1 hour | HIGH |
| Migrate ripgrep | MEDIUM | 3-4 hours | HIGH |
| Migrate ignore | LOW | 1 hour | HIGH |
| Migrate file operations | HIGH | 6-8 hours | HIGH |
| Migrate worktree | MEDIUM | 2-3 hours | MEDIUM |
| Move watcher | LOW | 1-2 hours | LOW |
| Update imports | MEDIUM | 3-4 hours | HIGH |
| Testing | HIGH | 4-6 hours | HIGH |
| **Total** | | **21-29 hours** | |

With focused work: **3-4 days**
