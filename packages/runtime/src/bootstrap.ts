import { Plugin } from "@opendora/opencode/plugin"
import { Format } from "@opendora/opencode/format"
import { LSP } from "@opendora/opencode/lsp"
import { FileWatcher } from "@opendora/opencode/file/watcher"
import { File } from "@opendora/opencode/file"
import { Project } from "./project"
import { Bus } from "./bus"
import { Command } from "@opendora/opencode/command"
import { Instance } from "./instance"
import { Vcs } from "./vcs"
import { Log } from "@opendora/util/log"
import { ShareNext } from "@opendora/opencode/share/share-next"
import { Snapshot } from "./snapshot"
import { Truncate } from "@opendora/opencode/tool/truncation"
import { Skill } from "@opendora/opencode/skill/skill"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
  await Plugin.init()
  ShareNext.init()
  Format.init()
  await LSP.init()
  FileWatcher.init()
  File.init()
  Vcs.init()
  Snapshot.init()
  Truncate.init()
  Skill.watchDirs().catch(() => {})

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      await Project.setInitialized(Instance.project.id)
    }
  })
}
