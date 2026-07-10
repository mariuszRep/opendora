import { Server } from "@projectflows/server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@projectflows/util/flag"
import { CheckpointStore } from "@projectflows/workflow/checkpoint-store"
import { runOnboarding } from "./onboarding"
import { CoreSetup } from "@projectflows/server/core-setup"
import { Global } from "@projectflows/util/global"
import { join } from "node:path"
import { existsSync } from "node:fs"
import { EMBEDDED_WEB_TAR } from "../../embedded-assets"
import { extractTarGz } from "../../util/extract"

/**
 * On first run of a compiled binary, extract the embedded web tarball into
 * ~/.projectflows/ so the server can find it without needing files placed next
 * to the executable.
 *
 * - web.tar.gz -> ~/.projectflows/web/   (detected by server.ts webDir resolution)
 *
 * Extraction is guarded by index.html so it only happens once.
 */
async function ensureEmbeddedWeb(): Promise<void> {
  if (!existsSync(join(Global.Path.config, "web", "index.html"))) {
    await extractTarGz(EMBEDDED_WEB_TAR, Global.Path.config)
  }
}

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) =>
    withNetworkOptions(yargs).option("web-dir", {
      type: "string",
      description: "Directory containing the static web UI (defaults to adjacent web/ folder)",
    }),
  describe: "starts a headless projectflows server",
  handler: async (args) => {
    await ensureEmbeddedWeb()

    // Dev mode: if PROJECTFLOWS_REGISTRY_PATH points to a local registry and core
    // isn't installed yet, auto-install from that registry without prompting.
    if (process.env["PROJECTFLOWS_REGISTRY_PATH"] && !(await CoreSetup.isComplete())) {
      console.log("Installing core capabilities from local registry…")
      const result = Bun.spawnSync(
        ["bun", "scripts/package-core.ts", "--install"],
        { cwd: import.meta.dir + "/../../../../..", stdio: ["inherit", "inherit", "inherit"] },
      )
      if (result.exitCode !== 0) {
        console.warn("Core auto-install failed — falling back to interactive setup.")
        await runOnboarding()
      }
    } else {
      await runOnboarding()
    }
    if (!Flag.PROJECTFLOWS_SERVER_PASSWORD) {
      console.log("Warning: PROJECTFLOWS_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = await resolveNetworkOptions(args)
    const server = Server.listen({ ...opts, webDir: (args as any)["web-dir"] })
    const url = `http://${server.hostname === "0.0.0.0" ? "localhost" : server.hostname}:${server.port}`
    console.log(`Projectflows is running at ${url}`)
    console.log("Open your browser to get started.")
    const incomplete = await CheckpointStore.findIncomplete()
    if (incomplete.length > 0) {
      console.log(`Warning: ${incomplete.length} workflow run(s) were interrupted and can be resumed from the UI.`)
    }
    await new Promise(() => {})
    await server.stop()
  },
})
