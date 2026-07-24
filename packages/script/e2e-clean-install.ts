#!/usr/bin/env bun
/**
 * Clean-install E2E test: proves a bare-minimum install actually works.
 *
 * Fresh HOME (no ~/.projectflows/) -> `bun scripts/package-core.ts --install`
 * against a local sibling projectflows-website registry checkout -> verify
 * exactly the core plugin set landed -> start `serve` -> confirm /health.
 *
 * Local-only: depends on a local sibling projectflows-website checkout, which
 * a fresh CI runner doesn't have (separate GitHub repo, no submodule) — same
 * assumption scripts/package-core.ts's dev install already makes. Not wired
 * into .github/workflows/ci.yml; run manually:
 *
 *   bun run e2e:clean-install
 *   bun packages/script/e2e-clean-install.ts --registry /path/to/registry
 */
import { join } from "node:path"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import os from "node:os"

const REPO_ROOT = join(import.meta.dir, "..", "..") // packages/script -> packages -> repo root

// Must match packages/server/src/core-setup.ts's CORE_PLUGINS.
const CORE_PLUGINS = ["agents-default", "filesystem", "web-search", "skill-manager"]

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const REGISTRY =
  arg("--registry") ??
  process.env["PROJECTFLOWS_REGISTRY_PATH"] ??
  join(REPO_ROOT, "..", "projectflows-website", "registry")

function log(msg: string) {
  console.log(`[e2e] ${msg}`)
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) {
        const body = (await res.json()) as { ok?: boolean }
        if (body?.ok === true) return
        lastError = new Error(`unexpected /health body: ${JSON.stringify(body)}`)
      } else {
        lastError = new Error(`/health returned HTTP ${res.status}`)
      }
    } catch (err) {
      lastError = err
    }
    await Bun.sleep(300)
  }
  throw new Error(`Server never became healthy on port ${port}: ${lastError}`)
}

async function main() {
  if (!existsSync(REGISTRY)) {
    console.error(`Registry not found at ${REGISTRY}`)
    console.error(
      "This E2E test requires a local sibling projectflows-website checkout.\n" +
        "Pass --registry <path> or set PROJECTFLOWS_REGISTRY_PATH.\n" +
        "It is intentionally not run in CI — see .projectflows/goals/*/bare-binary-cleanup-verification/GOAL.md.",
    )
    process.exit(1)
  }

  const tmpHome = await mkdtemp(join(os.tmpdir(), "pf-e2e-home-"))
  const tmpProject = await mkdtemp(join(os.tmpdir(), "pf-e2e-project-"))
  let serverProc: ReturnType<typeof Bun.spawn> | undefined

  try {
    const capabilityRoot = join(tmpHome, ".projectflows")
    if (existsSync(capabilityRoot)) {
      throw new Error(`Expected fresh state, but ${capabilityRoot} already exists`)
    }

    log(`Installing core capabilities from ${REGISTRY} into ${capabilityRoot}...`)
    const install = Bun.spawnSync(["bun", "scripts/package-core.ts", "--install"], {
      cwd: REPO_ROOT,
      env: { ...process.env, HOME: tmpHome, PROJECTFLOWS_REGISTRY_PATH: REGISTRY },
      stdio: ["inherit", "inherit", "inherit"],
    })
    if (install.exitCode !== 0) {
      throw new Error(`package-core.ts --install failed with exit code ${install.exitCode}`)
    }

    log("Verifying exactly the core plugin set was installed...")
    const lockfilePath = join(capabilityRoot, "plugins.lock.json")
    const lockfile = JSON.parse(await readFile(lockfilePath, "utf-8")) as { plugins: Record<string, unknown> }
    const installedIds = Object.keys(lockfile.plugins).sort()
    const expectedIds = [...CORE_PLUGINS].sort()
    if (JSON.stringify(installedIds) !== JSON.stringify(expectedIds)) {
      throw new Error(
        `Installed plugin set does not match core exactly.\n` +
          `  expected: ${expectedIds.join(", ")}\n` +
          `  actual:   ${installedIds.join(", ")}`,
      )
    }
    log(`Core plugin set matches exactly: ${installedIds.join(", ")}`)

    const port = 20000 + Math.floor(Math.random() * 20000)
    log(`Starting server on port ${port} (HOME=${tmpHome})...`)
    serverProc = Bun.spawn(
      ["bun", "run", join(REPO_ROOT, "apps/cli/src/index.ts"), "serve", "--port", String(port), "--hostname", "127.0.0.1"],
      {
        cwd: tmpProject,
        env: { ...process.env, HOME: tmpHome },
        stdout: "inherit",
        stderr: "inherit",
      },
    )

    await waitForHealth(port, 15_000)
    log("Server responded healthy at /health — bare-minimum app works.")

    console.log("\nClean-install E2E test PASSED.")
  } finally {
    serverProc?.kill()
    await rm(tmpHome, { recursive: true, force: true })
    await rm(tmpProject, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error("\nClean-install E2E test FAILED.")
  console.error(err)
  process.exit(1)
})
