import { cmd } from "./cmd"
import { resolveService } from "../../daemon/service"

export const StopCommand = cmd({
  command: "stop",
  describe: "stop the opendora server",
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

      await service.stop({ stdout: process.stdout, env })
      console.log("✓ OpenDora stopped")
    } catch (error) {
      console.error("Failed to stop OpenDora:", error instanceof Error ? error.message : error)
      process.exit(1)
    }
  },
})
