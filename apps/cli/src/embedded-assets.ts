// Files referenced here are embedded into the compiled binary by Bun at build
// time (via the `new URL("path", import.meta.url)` pattern). At runtime inside
// the binary, Bun.file(url) reads the embedded bytes without touching the disk.
// In dev mode the URL resolves to the actual file in dist/; build it first with
// `bun scripts/build-binary.ts --target bun-current-platform`.

export const EMBEDDED_WEB_TAR = new URL("../../../dist/web.tar.gz", import.meta.url)
