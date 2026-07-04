import { Lockfile, type LockfileData } from "./lockfile.js"
import { PluginStorage } from "./storage.js"

export interface ResolvedScope {
  global: LockfileData
  project: LockfileData
  effective: LockfileData
}

export namespace PluginScope {
  export async function resolve(projectDir?: string): Promise<ResolvedScope> {
    const globalData = await Lockfile.read(PluginStorage.globalLockfilePath())
    const projectData = projectDir
      ? await Lockfile.read(PluginStorage.projectLockfilePath(projectDir))
      : Lockfile.empty()
    return {
      global: globalData,
      project: projectData,
      effective: Lockfile.merge(globalData, projectData),
    }
  }
}
