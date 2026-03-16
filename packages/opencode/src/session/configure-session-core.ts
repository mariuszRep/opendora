/**
 * Configures @opendora/session-core with opencode's runtime dependencies.
 * Call once at startup, after the Database is initialized.
 */
import { configure } from "@opendora/session-core"
import { Database } from "@/storage/db"
import { Global } from "@/global"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Storage } from "@/storage/storage"
import { Snapshot } from "@/snapshot"
import { Instance } from "@/project/instance"
import { Agent } from "@/agent"
import { PermissionNext } from "@/permission/next"
import { Plugin } from "@/plugin"
import { Scheduler } from "@/scheduler"
import { LSP } from "@/lsp"

let configured = false

export function configureSessionCore() {
  if (configured) return
  configured = true

  configure({
    // Wrap Database.Client() so it's resolved lazily at call time
    get db() {
      return Database.Client()
    },
    dataPath: Global.Path.data,
    opencodeBus: {
      publish(eventDef: any, payload: any) {
        Bus.publish(eventDef, payload)
      },
    },
    bus: {
      publish(eventDef: any, payload: any) {
        Bus.publish(eventDef, payload)
      },
    },
    config: {
      get() {
        return Config.get()
      },
      async directories() {
        return []
      },
    },
    storage: {
      read<T>(key: string[]) {
        return Storage.read<T>(key)
      },
      write<T>(key: string[], value: T) {
        return Storage.write(key, value)
      },
    },
    snapshot: {
      track() {
        return Snapshot.track()
      },
      patch(id: string) {
        return Snapshot.patch(id)
      },
      diff(id: string) {
        return Snapshot.diff(id)
      },
      diffFull(from: string, to: string) {
        return Snapshot.diffFull(from, to)
      },
      revert(patches: any[]) {
        return Snapshot.revert(patches)
      },
      restore(id: string) {
        return Snapshot.restore(id)
      },
    },
    get instance() {
      return {
        directory: Instance.directory,
        worktree: Instance.worktree,
        project: Instance.project,
      }
    },
    agent: {
      get(name: string) {
        return Agent.get(name)
      },
      getByIdOrName(id: string) {
        return Agent.getByIdOrName(id)
      },
      defaultAgent() {
        return Agent.defaultAgent()
      },
    },
    permissionNext: {
      ask: PermissionNext.ask,
      disabled: PermissionNext.disabled,
      // Expose error classes for instanceof checks in processor.ts
      get RejectedError() {
        return PermissionNext.RejectedError
      },
    },
    plugin: {
      trigger(event: string, ctx: any, payload: any) {
        return Plugin.trigger(event as any, ctx, payload)
      },
    },
    scheduler: Scheduler,
    lsp: {
      async touchFile(path: string) {
        return LSP.touchFile(path)
      },
      async diagnostics(_path: string) {
        return LSP.diagnostics()
      },
    },
  })
}
