import { dirname, isAbsolute, relative, resolve } from "node:path"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"

/**
 * Extract a .tar.gz file given as a URL. This works for both disk files and
 * Bun-embedded blob URLs without relying on a platform tar executable.
 *
 * Returns true on success, false if the source file doesn't exist (dev mode
 * without pre-built tarballs) so callers can skip gracefully.
 */
export async function extractTarGz(source: URL, destDir: string): Promise<boolean> {
  const srcFile = Bun.file(source)
  if (!(await srcFile.exists())) return false

  mkdirSync(destDir, { recursive: true })
  const destRoot = resolve(destDir)
  const tar = gunzipSync(Buffer.from(await srcFile.arrayBuffer()))

  let offset = 0
  let nextPath: string | undefined

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    offset += 512
    if (header.every((byte) => byte === 0)) break

    const size = parseOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] || 0)
    const body = tar.subarray(offset, offset + size)
    offset += Math.ceil(size / 512) * 512

    if (type === "x") {
      const pax = parsePax(body)
      nextPath = pax.path ?? nextPath
      continue
    }

    if (type === "L") {
      nextPath = readString(body, 0, body.length)
      continue
    }

    const rawPath = nextPath ?? readHeaderPath(header)
    nextPath = undefined
    if (!rawPath) continue

    const target = resolve(destRoot, rawPath)
    const rel = relative(destRoot, target)
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`Refusing to extract path outside destination: ${rawPath}`)
    }

    if (type === "5") {
      mkdirSync(target, { recursive: true })
      continue
    }

    if (type === "0" || type === "\0") {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, body)
      const mode = parseOctal(header, 100, 8)
      if (mode) chmodSync(target, mode)
    }
  }

  return true
}

function parseOctal(buffer: Buffer, start: number, length: number): number {
  const value = readString(buffer, start, length).trim()
  return value ? Number.parseInt(value, 8) : 0
}

function readHeaderPath(header: Buffer): string {
  const name = readString(header, 0, 100)
  const prefix = readString(header, 345, 155)
  return prefix ? `${prefix}/${name}` : name
}

function readString(buffer: Buffer, start: number, length: number): string {
  const slice = buffer.subarray(start, start + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8")
}

function parsePax(buffer: Buffer): Record<string, string> {
  const result: Record<string, string> = {}
  let text = buffer.toString("utf8")

  while (text.length > 0) {
    const space = text.indexOf(" ")
    if (space === -1) break
    const length = Number.parseInt(text.slice(0, space), 10)
    if (!Number.isFinite(length) || length <= 0) break

    const record = text.slice(space + 1, length - 1)
    const equals = record.indexOf("=")
    if (equals !== -1) {
      result[record.slice(0, equals)] = record.slice(equals + 1)
    }
    text = text.slice(length)
  }

  return result
}
