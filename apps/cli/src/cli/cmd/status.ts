import { cmd } from "./cmd"
import { resolveService } from "../../daemon/service"

export const StatusCommand = cmd({
  command: "status",
  describe: "show projectflows server status",
  handler: async () => {
    const service = resolveService()
    const env = process.env as Record<string, string | undefined>

    try {
      const loaded = await service.isLoaded({ env })
      const runtime = await service.readRuntime(env)

      console.log(`Service: ${service.label}`)
      console.log(`Status: ${loaded ? service.loadedText : service.notLoadedText}`)

      if (loaded) {
        console.log(`Runtime: ${runtime.status}`)
        if (runtime.pid) {
          console.log(`PID: ${runtime.pid}`)
        }
        if (runtime.status === "running") {
          console.log(`URL: http://localhost:4096`)
        }
      } else {
        console.log("\nUse 'projectflows start' to start the server")
      }
    } catch (error) {
      console.error("Failed to check status:", error instanceof Error ? error.message : error)
      process.exit(1)
    }
  },
})
