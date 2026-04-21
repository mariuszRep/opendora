export class DesktopUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DesktopUnavailableError"
  }
}

type NutModule = typeof import("@nut-tree-fork/nut-js")

let _loadPromise: Promise<NutModule> | undefined

export async function getNut(): Promise<NutModule> {
  if (!_loadPromise) {
    _loadPromise = import("@nut-tree-fork/nut-js").catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      throw new DesktopUnavailableError(
        `@nut-tree-fork/nut-js failed to load: ${msg}\n` +
          `Ensure native prerequisites are installed — see packages/tools/desktop/README.md`,
      )
    })
  }
  return _loadPromise
}

export function resetNut(): void {
  _loadPromise = undefined
}
