import { chmod, mkdir, readFile, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { dirname } from "path"

export namespace Filesystem {
  export async function exists(p: string): Promise<boolean> {
    return existsSync(p)
  }

  export async function readText(p: string): Promise<string> {
    return readFile(p, "utf-8")
  }

  export async function readJson<T = any>(p: string): Promise<T> {
    return JSON.parse(await readFile(p, "utf-8"))
  }

  export async function readBytes(p: string): Promise<Buffer> {
    return readFile(p)
  }

  function isEnoent(e: unknown): e is { code: "ENOENT" } {
    return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "ENOENT"
  }

  export async function write(p: string, content: string | Buffer | Uint8Array, mode?: number): Promise<void> {
    try {
      if (mode) {
        await writeFile(p, content, { mode })
      } else {
        await writeFile(p, content)
      }
    } catch (e) {
      if (isEnoent(e)) {
        await mkdir(dirname(p), { recursive: true })
        if (mode) {
          await writeFile(p, content, { mode })
        } else {
          await writeFile(p, content)
        }
        return
      }
      throw e
    }
  }

  export async function writeJson(p: string, data: unknown, mode?: number): Promise<void> {
    return write(p, JSON.stringify(data, null, 2), mode)
  }
}
