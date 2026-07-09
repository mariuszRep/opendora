/**
 * CoreSetup — checks whether the core capability set is installed and exposes
 * a helper used by CLI startup commands to prompt the user when it is not.
 *
 * "Core" is the set of plugins defined in registry/core.json and bundled in
 * core.tar.gz. The install.sh script extracts them on fresh install; this
 * module detects when a user got the binary another way (e.g. manual copy)
 * and core is absent.
 */
import { CapabilityRegistry, Lockfile, PluginStorage } from "@projectflows/plugin"

/** Plugin IDs that constitute the minimum required core set. */
export const CORE_PLUGINS = ["agents-default", "filesystem", "web-search", "skill-manager"] as const

export type CorePlugin = (typeof CORE_PLUGINS)[number]

export interface CoreStatus {
  installed: CorePlugin[]
  missing: CorePlugin[]
  complete: boolean
}

export namespace CoreSetup {
  /**
   * Returns which core plugins are installed (present in the global lockfile)
   * and which are missing.
   */
  export async function check(): Promise<CoreStatus> {
    const lockfilePath = PluginStorage.globalLockfilePath()
    const lockfile = await Lockfile.read(lockfilePath)
    const installedIds = new Set(Object.keys(lockfile.plugins))

    const installed: CorePlugin[] = []
    const missing: CorePlugin[] = []

    for (const id of CORE_PLUGINS) {
      if (installedIds.has(id)) {
        installed.push(id)
      } else {
        missing.push(id)
      }
    }

    return { installed, missing, complete: missing.length === 0 }
  }

  /**
   * Returns true if all core plugins are installed.
   * Prefer `check()` when you need the full status breakdown.
   */
  export async function isComplete(): Promise<boolean> {
    return (await check()).complete
  }
}
