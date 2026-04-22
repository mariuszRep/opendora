import { createRequire } from "module"

export class DesktopUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DesktopUnavailableError"
  }
}

type NutModule = typeof import("@nut-tree-fork/nut-js")

// CJS require rooted here so bindings.getFileName() finds the right module_root.
const _require = createRequire(import.meta.url)

let _nut: NutModule | undefined

export async function getNut(): Promise<NutModule> {
  if (!_nut) {
    try {
      _nut = _require("@nut-tree-fork/nut-js") as NutModule
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new DesktopUnavailableError(
        `@nut-tree-fork/nut-js failed to load: ${msg}\n` +
          `Ensure native prerequisites are installed — see packages/tools/desktop/README.md`,
      )
    }
  }
  return _nut
}

export function resetNut(): void {
  _nut = undefined
}
