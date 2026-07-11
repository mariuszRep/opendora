# Dev reads local registry checkout, production always fetches from projectflows.ai

## Context
`scripts/package-core.ts` builds `dist/core.tar.gz` — the bundle of first-party core
agents/skills/tool-groups/workflows embedded in release/desktop builds. Today it *always*
reads from a local filesystem registry checkout (sibling repo `../projectflows-website/registry`,
overridable via `PROJECTFLOWS_REGISTRY_PATH`). That's how we hit the original build failure
this session: the sibling checkout simply didn't exist on this machine yet.

The user wants a firmer split: **dev builds keep reading the local sibling checkout**
(unchanged), but **production/release builds (`build:binary`, `build:desktop`) should always
fetch registry content over HTTP from the live site `https://projectflows.ai`**, never relying
on a local checkout being present, up to date, or containing uncommitted local edits.

Verified this is technically sound by reading the live site's own build pipeline
(`projectflows-website/scripts/build-registry.ts`) and the registry's `tools/*` contents:
- `packages/plugin/src/source.ts` already implements `RemoteRegistrySource` (`/api/plugins`)
  and `RemoteEntitySource` (`/api/entities/:type/:name`, with `downloadAndExtract()` that
  fetches+unzips a real file bundle) against a configurable `baseUrl`
  (`packages/config/src/config.ts:1123-1128` already defaults `registry.url` to
  `https://projectflows.ai`, the repo's existing convention).
- **Entity-level** downloads (agent/skill/workflow/tool-group) are real, non-empty bundles for
  every entity our core plugins reference (confirmed `filesystem`, `web`, `skills`, `agents`
  tool-groups all ship compiled `tools/*.js`).
- **Plugin-level** bundle downloads (`RemoteRegistrySource.downloadAndExtract`) are
  intentionally manifest-only for `provided: "core"` plugins (comment in the website's build
  script: "Core-provided plugins ship a manifest-only bundle") — **must not be used**. Instead:
  `RemoteRegistrySource.list()/.get()` for plugin/manifest metadata (filter `provided ===
  "core"` in place of local `core.json`), then `RemoteEntitySource.downloadAndExtract()` per
  capability for actual file content — mirroring today's per-capability local copy loop.
- `scripts/migrate-to-plugins.ts:22-23` already sets precedent for `scripts/*.ts` importing
  `packages/plugin/src/*.ts` directly.

**Known environment caveat**: `RemoteEntitySource.downloadAndExtract` shells out to `unzip`.
On this machine `unzip.exe` only exists under `C:\Program Files\Git\usr\bin`, which is **not**
on the default PowerShell PATH (only `Git\cmd`/`Git\bin` are) — confirmed via `where unzip` vs
`$env:Path`. Remote-mode builds run from PowerShell will fail here unless PATH includes that
directory. This is a pre-existing constraint of `source.ts` (also affects the live product's
in-app "install from catalog" feature on Windows), out of scope to fix — just something to
work around when testing (`$env:Path += ";C:\Program Files\Git\usr\bin"`), and worth a one-line
note in the verification section so it isn't mistaken for a code bug.

## Implementation

### 1. `scripts/package-core.ts`
- Add static import: `import { RemoteRegistrySource, RemoteEntitySource } from
  "../packages/plugin/src/source.ts"`.
- Add `--remote [baseUrl]` flag detection (near current `REGISTRY` resolution,
  lines 31-43): `const REMOTE = process.argv.includes("--remote")`, base URL from
  `arg("--remote")` (fix the existing `arg()` helper at lines 26-29 to not swallow a
  following flag as a value — only treat the next token as the value if it doesn't start
  with `-`) defaulting to `"https://projectflows.ai"`. Keep the existing local `REGISTRY`
  resolution + `existsSync` guard, but only run/enforce it `if (!REMOTE)`.
- Replace the `core.json` read (lines 104-111) with a branch: local unchanged; remote calls
  `RemoteRegistrySource.list(baseUrl)` and filters `provided === "core"` to get plugin IDs.
- Replace the per-plugin manifest read (lines 122-129) with a branch: local unchanged; remote
  calls `RemoteRegistrySource.get(baseUrl, pluginId)`, hard-fails (`process.exit(1)`) if
  `null` — a missing core plugin in production is a broken build, not a skip case.
- Add a small `resolveDir(kind, name)` helper returning `{dir, cleanup}`: local returns the
  existing `join(REGISTRY, ...)` path with a no-op cleanup; remote calls
  `RemoteEntitySource.downloadAndExtract(baseUrl, kind, name)` and returns a cleanup that
  removes the temp dir. Use it in all four capability branches (agent/skill/workflow/
  tool-group, lines 134-187), wrapping each copy in `try/finally` for cleanup.
- Remote-mode capability copy failures hard-fail instead of the local mode's current
  warn-and-skip (`console.warn(...); continue`) — add a one-line comment explaining why:
  production builds must not ship a silently-incomplete core bundle.
- Tool-group remote copy can be a straight whole-dir copy (`copyDir(dir, dest)`) since the
  extracted entity zip already has `group.json` + `tools/` at its root — no need to replicate
  local mode's two-step partial copy (which exists only to skip `src/`, absent from the built
  zip anyway). Keep local-mode copy logic exactly as-is.
- `cap.type === "tool"` branch (lines 188-192, lockfile-only, no file I/O) stays unchanged in
  both modes; when normalizing a remote `RemotePlugin.capabilities[]` entry (`{type, name,
  sourceGroup?}` — no `toolGroup` field) into the local shape, use `cap.sourceGroup ??
  cap.name` in place of `cap.toolGroup ?? cap.name`.
- Update the file's header comment (lines 12-16) to document the new `--remote [baseUrl]` flag.

### 2. `scripts/build-binary.ts:74`
`run("bun", ["run", join(ROOT, "scripts/package-core.ts")])` → append `"--remote"`.

### 3. `scripts/build-desktop.ts:51`
`run("bun", ["scripts/package-core.ts"])` → append `"--remote"`. (Line 50's `build-binary.ts`
call is a separate script invocation and needs no change itself — it doesn't call
`package-core.ts` internally.)

### 4. No changes to dev call sites
`apps/cli/src/cli/cmd/serve.ts:42-51` (gated by `PROJECTFLOWS_REGISTRY_PATH`) and root
`package.json:20` `dev:setup` stay on local-mode by default — correct as-is.

### 5. Doc updates (surgical, one or two sentences each — not rewrites)
- `VISION.md:157` — append after the existing `PROJECTFLOWS_REGISTRY_PATH` sentence:
  production builds (`build:binary`, `build:desktop`) never depend on the local checkout;
  they run `package-core.ts --remote` to fetch core capabilities over HTTP from
  `https://projectflows.ai` via `packages/plugin/src/source.ts`.
- `packages/plugin/VISION.md:33` — append: production builds fetch this catalog remotely
  over HTTP (`RemoteRegistrySource`/`RemoteEntitySource`) rather than reading a local checkout.
- `AGENTS.md:78` — append to the `bun dev:setup` bullet: production binaries instead fetch
  core capabilities from `https://projectflows.ai` at build time via `package-core.ts
  --remote`, used by `build:binary`/`build:desktop`.
- `packages/agent/VISION.md:11`, `packages/skills/VISION.md:11`,
  `packages/workflow/VISION.md:11`, `packages/VISION.md:11` — **no change**; these describe
  the runtime install model (`.projectflows/plugins/installed/...`), unaffected by a change to
  the build-time *source* of bundled core capabilities.
- `README.md`, `INSTALL.md` — confirmed no mentions of this sourcing model; no changes.

## Verification
1. `bun scripts/package-core.ts` (local, no flag) — confirm output unchanged from before.
2. `$env:Path += ";C:\Program Files\Git\usr\bin"` (unzip prerequisite on this machine), then
   `bun scripts/package-core.ts --remote --out dist/core-remote.tar.gz` — must complete with
   no hard-fails against the live `https://projectflows.ai`.
3. Extract both tarballs to separate temp dirs; diff the `agents/`, `skills/`, `workflows/`,
   `tools/` entry sets and `plugins.lock.json` capability lists — should match (file content
   may differ trivially by build timestamp, not by which capabilities are present).
4. Run `bun run build:binary` and `bun run build:desktop` end-to-end once to confirm the
   `--remote` flag is correctly wired into the full pipeline and both still produce working
   installers (reuse the same verification already done earlier this session: NSIS/MSI
   artifacts land in `apps/desktop/src-tauri/target/release/bundle/{nsis,msi}/`).

## Out of scope
No change to `RemoteEntitySource`'s use of a shell `unzip` (a pre-existing, more general
portability concern shared with the live product's runtime catalog-install feature). No change
to runtime plugin-install semantics or the four `packages/*/VISION.md` files describing them.
