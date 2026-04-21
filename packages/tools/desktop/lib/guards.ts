import type { Tool } from "../../tool.ts"
import { DesktopUnavailableError } from "./nut.ts"

export function assertNotSandbox(sandbox: boolean): void {
  if (sandbox) {
    throw new Error(
      "Desktop tools are disabled in sandbox mode. Set agent.config.sandbox = false to enable.",
    )
  }
}

export function assertDisplay(): void {
  if (
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  ) {
    throw new DesktopUnavailableError(
      "No display detected ($DISPLAY / $WAYLAND_DISPLAY not set). " +
        "Desktop tools require an active X11 or Wayland session on Linux.",
    )
  }
}
