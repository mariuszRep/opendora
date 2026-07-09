import { Server } from "@projectflows/server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@projectflows/util/flag"
import { CheckpointStore } from "@projectflows/workflow/checkpoint-store"
import { runOnboarding } from "./onboarding"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) =>
    withNetworkOptions(yargs).option("web-dir", {
      type: "string",
      description: "Directory containing the static web UI (defaults to adjacent web/ folder)",
    }),
  describe: "starts a headless projectflows server",
  handler: async (args) => {
    await runOnboarding()
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
