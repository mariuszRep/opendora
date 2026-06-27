import { cmd } from "./cmd"
import { resolveService } from "../../daemon/service"

export const RestartCommand = cmd({
  command: "restart",
  describe: "restart the opendora server",
  handler: async () => {
    const service = resolveService()
    const env = process.env as Record<string, string | undefined>

    try {
      const loaded = await service.isLoaded({ env })

      if (!loaded) {
        console.log(`OpenDora service ${service.notLoadedText}.`)
        console.log("Use 'opendora start' to start the server")
        return
      }

      await service.restart({ stdout: process.stdout, env })
      console.log("✓ OpenDora restarted")
      console.log("Server is running on http://localhost:4096")
    } catch (error) {
      console.error("Failed to restart OpenDora:", error instanceof Error ? error.message : error)
      process.exit(1)
    }
  },
})
