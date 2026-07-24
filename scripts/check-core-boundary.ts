#!/usr/bin/env bun
/**
 * Regression guard for the bare-core principle: core binary must not bundle
 * optional capabilities (agent templates, tool implementations, etc.) that
 * belong in the projectflows-website registry and install via the plugin
 * system instead.
 *
 * Scans packages/*\/src and apps/cli/src for:
 *   1. References to ".projectflows" (the install/config root) or
 *      "projectflows-website" (the registry source) that aren't on the
 *      allowlist below.
 *   2. Capability-content marker files (SKILL.md, group.json, PERSONA.md)
 *      that would indicate registry content got duplicated into core source.
 *
 * The allowlist is keyed by file path -> exact trimmed line text, not line
 * number, so an edited allowlisted line falls out of the allowlist (forcing
 * re-review) while unrelated line-number churn elsewhere in the file doesn't
 * cause false failures. Any allowlist entry whose text is never matched is
 * itself reported as an error (stale-entry detection), so the allowlist
 * can't silently rot into meaninglessness.
 */
import { join, relative } from "node:path"

const ROOT = join(import.meta.dir, "..")

// Matches ".projectflows" used as a directory/config-root segment (quoted,
// path-joined, or followed by whitespace/path separator) — NOT as part of a
// multi-label product domain like "app.projectflows.ai" or the launchd label
// "ai.projectflows.server" (those are followed by another "." or letter).
const DIR_REF = /\.projectflows(?![.\w-])/
const WEBSITE_REF = /projectflows-website/

const SCAN_GLOBS = ["packages/*/src/**/*.{ts,tsx}", "apps/cli/src/**/*.{ts,tsx}"]

const MARKER_FILES = ["SKILL.md", "group.json", "PERSONA.md"]

/**
 * Known-legitimate references: core-required config-dir resolution and
 * plugin-storage-root code, not bundled registry content. Keyed by path
 * relative to repo root.
 */
const ALLOWLIST: Record<string, string[]> = {
  "packages/agent/src/storage.ts": [`export const PROJECTFLOWS_DIR = ".projectflows"`],
  "packages/agent/src/index.ts": [
    `* summary) is sourced entirely from plugin install — see projectflows-website's`,
  ],
  "packages/config/src/paths.ts": [`targets: [".opencode", ".projectflows"],`],
  "packages/config/src/config.ts": [
    `// 2) Global config (~/.projectflows/projectflows.json{,c})`,
    `// 5) .projectflows directories (.projectflows/agents/, .projectflows/commands/, .projectflows/plugins/, .projectflows/projectflows.json{,c})`,
    `// .projectflows directory config overrides (project and global) config sources.`,
    `if (dir.endsWith(".projectflows") || dir.endsWith(".opencode") || dir === Flag.PROJECTFLOWS_CONFIG_DIR) {`,
    `// Agents are defined exclusively by agent.json files in .projectflows/agents/<id>/`,
    `// Write to .projectflows/projectflows.json when using custom config dir`,
  ],
  "packages/config/src/tui.ts": [
    `if ((!dir.endsWith(".projectflows") && !dir.endsWith(".opencode")) && dir !== Flag.PROJECTFLOWS_CONFIG_DIR) continue`,
  ],
  "packages/plugin/src/storage.ts": [
    `// Global config root: ~/.projectflows/`,
    `// Plugin bundle dir: ~/.projectflows/plugins/<id>/`,
    `// Project config root: <projectDir>/.projectflows/`,
    `return path.join(projectDir, ".projectflows")`,
    `// Plugin bundle dir (project-scoped): <projectDir>/.projectflows/plugins/<id>/`,
    `// Tool-group layout helpers — ~/.projectflows/tools/<groupId>/`,
  ],
  "packages/plugin/src/installer.ts": [
    `// Plugin bundle dir: ~/.projectflows/plugins/<id>/`,
    `// Capability root: ~/.projectflows/`,
  ],
  "packages/plugin/src/migration.ts": [
    `* One-time migration from flat ~/.projectflows/tools/*.js layout to the`,
    `* self-contained group folder layout ~/.projectflows/tools/<group>/tools/*.js.`,
    `* @param capRoot        Capability root to migrate (e.g. ~/.projectflows/)`,
  ],
  "packages/plugin/src/registry.ts": [
    `// installedDir is the capability root (~/.projectflows/), not the plugin bundle dir.`,
    `// Tool registry scans {tool,tools}/*.js from here → ~/.projectflows/tools/*.js`,
    `// Skill scanner uses {skill,skills}/**/SKILL.md from here → ~/.projectflows/skills/`,
  ],
  "packages/plugin/src/catalog.ts": [
    // Known dev-machine fallback: hardcoded path, inert off the author's machine
    // (listPacks()'s try/catch no-ops on a missing dir). Fix tracked separately;
    // not touched by this goal (no capability-removal work in scope).
    `return path.join(os.homedir(), "projects", "projectflows-website", "registry")`,
  ],
  "packages/util/src/global.ts": [
    `//   3. ~/.projectflows (the user's home folder)`,
    `if (testHome) return path.join(testHome, ".projectflows")`,
    `return path.join(os.homedir(), ".projectflows")`,
  ],
  "packages/server/src/routes/memory.ts": [
    `if (!pfDir) return c.json({ error: "No .projectflows directory found" }, 404)`,
  ],
  "packages/server/src/routes/agent.ts": [
    `description: "Get a list of all available agents, including file-based agents in .projectflows/agents/.",`,
    `description: "Create a new agent. Writes agent.json and persona.md into .projectflows/agents/<id>/.",`,
    `description: "Delete an agent's .projectflows/agents/<id>/ directory.",`,
  ],
  "packages/server/src/configure-session-core.ts": [
    `// Agents are installed to ~/.projectflows/agents/ and AgentCore.list() already scans there.`,
  ],
  "packages/session/src/system.ts": [
    `const candidate = path.join(dir, ".projectflows")`,
    `if (parent === dir) throw new Error("No .projectflows directory found")`,
  ],
  "packages/skills/src/skill.ts": [
    `// Scan .projectflows/skill/ directories`,
    `: path.join(Instance.directory, ".projectflows", "skill")`,
    `/** Create a new local skill under the first .projectflows/skills/ directory */`,
    `: path.join(Instance.directory, ".projectflows", "skills")`,
  ],
  "packages/workflow/src/migration.ts": [
    `* One-time migration from flat ~/.projectflows/workflows/<id>.json layout to the`,
    `* per-workflow folder layout ~/.projectflows/workflows/<id>/workflow.json.`,
    `* @param dir A workflows root to migrate, e.g. ~/.projectflows/workflows.`,
  ],
  "packages/workflow/src/runner.run-workflow.test.ts": [
    `// real registry tool (projectflows-website/registry/tools/workflows/src/`,
  ],
  "packages/runtime/src/agent.ts": [
    `// portable declaration for archives distributed via the projectflows-website registry.`,
  ],
  "apps/cli/src/cli/cmd/serve.ts": [
    `* ~/.projectflows/ so the server can find it without needing files placed next`,
    `* - web.tar.gz -> ~/.projectflows/web/   (detected by server.ts webDir resolution)`,
  ],
  "apps/cli/src/cli/cmd/start.ts": [
    `PROJECTFLOWS_CONFIG_DIR: path.join(os.homedir(), ".projectflows"),`,
  ],
  "apps/cli/src/cli/cmd/tui/component/tips.tsx": [
    `"Add {highlight}.md{/highlight} files to {highlight}.projectflows/command/{/highlight} to define reusable custom prompts",`,
    `"Add {highlight}.md{/highlight} files to {highlight}.projectflows/agent/{/highlight} for specialized AI personas",`,
    `"Create {highlight}.ts{/highlight} files in {highlight}.projectflows/tools/{/highlight} to define new LLM tools",`,
    `"Add {highlight}.ts{/highlight} files to {highlight}.projectflows/plugin/{/highlight} for event hooks",`,
  ],
}

interface Violation {
  file: string
  line: number
  text: string
}

async function scan(): Promise<{ violations: Violation[]; staleAllowlist: string[] }> {
  const violations: Violation[] = []
  const matchedAllowlist = new Set<string>()

  for (const pattern of SCAN_GLOBS) {
    const glob = new Bun.Glob(pattern)
    for await (const file of glob.scan({ cwd: ROOT, absolute: false })) {
      const relPath = file.split(require("node:path").sep).join("/")
      const contents = await Bun.file(join(ROOT, file)).text()
      const lines = contents.split("\n")
      const allowed = ALLOWLIST[relPath] ?? []

      lines.forEach((raw, idx) => {
        if (!DIR_REF.test(raw) && !WEBSITE_REF.test(raw)) return
        const text = raw.trim()
        if (allowed.includes(text)) {
          matchedAllowlist.add(`${relPath} ${text}`)
          return
        }
        violations.push({ file: relPath, line: idx + 1, text })
      })
    }
  }

  const staleAllowlist: string[] = []
  for (const [file, lines] of Object.entries(ALLOWLIST)) {
    for (const text of lines) {
      if (!matchedAllowlist.has(`${file} ${text}`)) {
        staleAllowlist.push(`${file}: "${text}"`)
      }
    }
  }

  return { violations, staleAllowlist }
}

async function scanMarkerFiles(): Promise<string[]> {
  const hits: string[] = []
  for (const pattern of SCAN_GLOBS) {
    const dirGlob = pattern.replace(/\*\*\/\*\.\{ts,tsx\}$/, "**/*")
    const glob = new Bun.Glob(dirGlob)
    for await (const file of glob.scan({ cwd: ROOT, absolute: false })) {
      const base = file.split("/").pop() ?? ""
      if (MARKER_FILES.includes(base)) {
        hits.push(relative(ROOT, join(ROOT, file)))
      }
    }
  }
  return hits
}

async function main() {
  const { violations, staleAllowlist } = await scan()
  const markerHits = await scanMarkerFiles()

  let failed = false

  if (violations.length > 0) {
    failed = true
    console.error(`\nFound ${violations.length} unallowlisted core-boundary reference(s):\n`)
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}`)
      console.error(`    ${v.text}`)
    }
    console.error(
      `\nCore source (packages/*/src, apps/cli/src) must not bundle optional capabilities or\n` +
        `reference the projectflows-website registry directly. If this reference is a\n` +
        `legitimate config-dir/plugin-storage resolution, add its exact trimmed line text\n` +
        `to ALLOWLIST in scripts/check-core-boundary.ts. Otherwise, move the capability to\n` +
        `the registry and install it via the plugin system.`,
    )
  }

  if (staleAllowlist.length > 0) {
    failed = true
    console.error(`\nFound ${staleAllowlist.length} stale allowlist entr${staleAllowlist.length === 1 ? "y" : "ies"} (no longer matched in source):\n`)
    for (const entry of staleAllowlist) {
      console.error(`  ${entry}`)
    }
    console.error(`\nRemove these from ALLOWLIST in scripts/check-core-boundary.ts.`)
  }

  if (markerHits.length > 0) {
    failed = true
    console.error(`\nFound ${markerHits.length} capability-content marker file(s) in core source:\n`)
    for (const hit of markerHits) {
      console.error(`  ${hit}`)
    }
    console.error(
      `\nSKILL.md / group.json / PERSONA.md indicate registry content (skills, tool groups,\n` +
        `agent personas) duplicated into core source instead of installed via the plugin\n` +
        `system. Move this content to the projectflows-website registry.`,
    )
  }

  if (failed) process.exit(1)

  console.log("Core boundary check passed: no bare-core violations found.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
