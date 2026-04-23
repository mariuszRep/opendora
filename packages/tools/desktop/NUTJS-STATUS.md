# @nut-tree-fork/nut-js — Working Status

Test environment: WSL2 + WSLg (Xwayland + Weston), Bun 1.3.x.
Test target: `xeyes -geometry 400x300+200+200` (real Linux X11 client, `WM_NAME=xeyes`).

## Matrix (live-probed)

| API | Status | Evidence / notes |
|---|---|---|
| `screen.width / height` | ✅ | Returns `7680 × 4082`. |
| `screen.grab()` full | ❌ WSLg hard-limit | `X_GetImage(root)` → `BadMatch`. Root has no pixmap in seamless mode. |
| `screen.grabRegion()` | ❌ | Same `X_GetImage` path, same error. |
| `screen.colorAt()` | ❌ | Same path; swallowed as "Failed to capture screen". |
| `screen.find(template)` | ❌ (on WSLg) | Depends on `grab()`. Would work on Xorg/Xvfb. |
| `mouse.getPosition()` | ✅ | |
| `mouse.setPosition / move` | ✅ | |
| `mouse.leftClick / rightClick / click` | ✅ | |
| `mouse.scrollUp/Down/Left/Right` | ✅ | |
| `mouse.pressButton + releaseButton` (drag) | ✅ | |
| `keyboard.type()` | ✅ | |
| `keyboard.pressKey / releaseKey` | ✅ | |
| `clipboard.getContent()` | ✅ | After removing `--conditions=browser` from server scripts. |
| `clipboard.setContent()` | ✅ | Same. |
| `getActiveWindow()` | ⚠ | Returns a window handle, but `title=""` and region `0×0`. |
| `getWindows()` | ⚠ | Returns 4 windows (Xwayland wrappers), all with empty titles. Real xeyes client window (WID 0x60000a, `WM_NAME="xeyes"`) is **not in the list** — WSLg reparents clients; nut-js only sees the outer wrappers. |
| `window.getRegion()` | ⚠ | Returns wrapper geometry, not the client window's geometry. |
| `window.focus / move / resize` | ⚠ | Act on wrapper; WSLg's compositor owns real placement. |

## Root causes

### 1. Screen capture on WSLg — not fixable in nut-js
WSLg runs Weston in seamless mode: there is no compositor-backed root pixmap. `XGetImage` against the root window fails with `BadMatch`. Per-window capture via `XGetImage(window_id)` on a client's own pixmap does work (ImageMagick's `import -window <id>` proves it; we confirmed live with xeyes). nut-js exposes no per-window capture API, so this requires a shell fallback.

### 2. Window enumeration on WSLg — not fixable in nut-js
WSLg has no EWMH window manager, so `_NET_CLIENT_LIST` is empty. libnut's `XQueryTree(root)` sees only Xwayland's top-level wrappers. The real client windows (with `WM_NAME`, `WM_CLASS`) are nested **inside** the wrappers and not surfaced. libnut would need to recursively walk the tree and read legacy ICCCM `WM_NAME` on inner windows; the current binary does not.

### 3. Clipboard under `--conditions=browser` — **FIXED**
`packages/opencode` uses `--conditions=browser` to enable SolidJS exports for the TUI. Both `clipboardy@4` and `clipboardy@2` ship a `browser` export condition that points to a `navigator.clipboard`-based ESM file with no `.default`. The `@nut-tree-fork/default-clipboard-provider` does `__importDefault(require("clipboardy")).default.read/writeSync` → crashes.
**Fix:** dropped `--conditions=browser` from server scripts (`serve`, `start`, `stop`, `restart`, `status` in root `package.json`) and from the subprocess spawn in `packages/opencode/src/cli/cmd/start.ts`. TUI scripts (`dev`, `tui`) keep the flag because they actually load SolidJS. `packages/opencode/src/cli/cmd/tui/util/clipboard.ts` uses `clipboardy` via its own shell fallbacks and is unaffected.

## Environments where nut-js is expected to work fully

- Real Xorg desktops (GNOME/KDE on bare Ubuntu).
- Xvfb (headless Linux CI/servers).
- Windows host (native WinAPI bindings in `@nut-tree-fork/libnut-win32`).
- macOS host (native CoreGraphics bindings in `@nut-tree-fork/libnut-darwin`).

## Things we implemented as fallbacks (to revisit later)

- `lib/clipboard-native.ts` — `wl-copy`/`xclip` wrapper. Currently **disabled** (`nativeClipboardPreferred()` → `false`) now that nut-js clipboard works. Kept as a safety net.
- `lib/screen-native.ts` — `scrot`/`maim`/`import` wrapper. Currently **enabled under WSL** (`nativeCapturePreferred()` returns true on WSL) because nut-js physically cannot capture there. On real Xorg/Xvfb/Windows/macOS, the original nut-js path is used.
- `x11_nocrash.so` (`LD_PRELOAD`) — installs a silent `XSetErrorHandler` so libnut's fatal X errors don't kill the process. Still required when anything probes `screen.grab()` under WSLg.

## Open, not yet fixed

- `desktop_screen_find_image` / `desktop_screen_wait_for_image` — resolve `templatePath` relative to `packages/opencode/` instead of honoring absolute `/tmp/...` input. Separate path-resolution bug in those tools, not a nut-js issue.
- Full-screen capture on WSLg returns a (real, but empty) 7680×4082 black PNG because the root has no content. Practically useful only when a Linux GUI client is up; otherwise expected to be empty. A future per-window-capture tool would address this.
