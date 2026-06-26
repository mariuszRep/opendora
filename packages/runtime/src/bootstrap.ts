import { Format } from "./format"
import { Instance } from "./instance"
import { Vcs } from "./vcs"
import { Log } from "@projectflows/util/log"
import { Snapshot } from "./snapshot"
import { Skill } from "@projectflows/skills/skill"

/**
 * Packages above runtime (server, tools, session) register their own bootstrap
 * work here instead of runtime importing them directly — those packages already
 * depend on runtime, so a direct import back would cycle. Each module that needs
 * to run during instance bootstrap calls `registerBootstrapHook` at module load
 * (see e.g. packages/server/src/plugin/index.ts, packages/tools/file/index.ts).
 */
type BootstrapHook = () => Promise<void> | void
const hooks: BootstrapHook[] = []

export function registerBootstrapHook(hook: BootstrapHook) {
  hooks.push(hook)
}

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  Format.init()
  Vcs.init()
  Snapshot.init()
  Skill.watchDirs().catch(() => {})

  for (const hook of hooks) {
    await hook()
  }
}
