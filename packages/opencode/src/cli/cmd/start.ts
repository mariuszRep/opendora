import { cmd } from "./cmd"
import { resolveService } from "../../daemon/service"
import { Installation } from "../../installation"
import path from "path"

export const StartCommand = cmd({
  command: "start",
  describe: "start the opendora server in the background",
  handler: async () => {
    const service = resolveService()
    const env = process.env as Record<string, string | undefined>

    try {
      // Check if service is already installed
      const loaded = await service.isLoaded({ env })

      if (!loaded) {
        console.log("First time setup - installing service...")

        // Determine the bun executable path
        const bunPath = process.execPath || "bun"
        
        // Build the command to run - find project root by looking for package.json
        let projectRoot = process.cwd()
        while (projectRoot !== "/" && projectRoot !== ".") {
          const pkgPath = path.join(projectRoot, "package.json")
          try {
            const pkg = await Bun.file(pkgPath).json()
            if (pkg.name === "opendora") break
          } catch {}
          projectRoot = path.dirname(projectRoot)
        }
        
        const opencodePath = path.join(projectRoot, "packages/opencode")
        
        const programArguments = [
          bunPath,
          "run",
          "--cwd",
          opencodePath,
          "--conditions=browser",
          "src/index.ts",
          "serve",
          "--port",
          "4096",
        ]

        await service.install({
          env,
          stdout: process.stdout,
          programArguments,
          workingDirectory: projectRoot,
          environment: {
            OPENCODE_CONFIG_DIR: path.join(projectRoot, ".opendora"),
            OPENDORA_SERVICE_VERSION: Installation.VERSION,
          },
          description: `OpenDora Server (v${Installation.VERSION})`,
        })

        console.log("✓ Service installed")
      }

      // Start the service
      await service.restart({ stdout: process.stdout, env })
      
      console.log("✓ OpenDora is running on http://localhost:4096")
      console.log("\nUse 'opendora status' to check the server status")
      console.log("Use 'opendora stop' to stop the server")
    } catch (error) {
      console.error("Failed to start OpenDora:", error instanceof Error ? error.message : error)
      process.exit(1)
    }
  },
})
