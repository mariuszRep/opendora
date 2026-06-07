import type { Hooks } from "@opencode-ai/plugin"

type PluginLister = () => Promise<Hooks[]>

let lister: PluginLister | undefined

export function register(fn: PluginLister): void {
  lister = fn
}

export function list(): Promise<Hooks[]> {
  return lister ? lister() : Promise.resolve([])
}
