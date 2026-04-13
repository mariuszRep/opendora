// Export simple browser tool
export { BrowserTool } from "./simple-browser"

// Export minimal browser server
import { startBrowserServer, stopBrowserServer } from "./minimal-server"

let browserServer: any = null

export async function startBrowserControlServiceFromConfig() {
  if (!browserServer) {
    browserServer = await startBrowserServer(8338)
  }
  return browserServer
}

export async function stopBrowserControlService() {
  await stopBrowserServer()
  if (browserServer) {
    browserServer.stop()
    browserServer = null
  }
}
