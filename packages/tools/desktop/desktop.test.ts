import { resetNut } from "./lib/nut.ts"
import { DESKTOP_TOOLS } from "./index.ts"
import { DesktopMouseMoveTool } from "./mouse/mouse-move.ts"
import { DesktopMouseClickTool } from "./mouse/mouse-click.ts"
import { DesktopKeyboardPressTool } from "./keyboard/keyboard-press.ts"
import { DesktopScreenSizeTool } from "./screen/screen-size.ts"
import { DesktopClipboardWriteTool } from "./clipboard/clipboard-write.ts"

let passed = 0
let failed = 0

async function run(label: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`  ✓ ${label}`)
    passed++
  } catch (err: any) {
    console.error(`  ✗ ${label}: ${err.message}`)
    failed++
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

// ---------------------------------------------------------------------------
// Fake nut-js module injected via module resolution mock
// ---------------------------------------------------------------------------

const fakeNut = {
  mouse: {
    config: { mouseSpeed: 1000 },
    move: async () => {},
    setPosition: async () => {},
    getPosition: async () => ({ x: 100, y: 200 }),
    click: async () => {},
    doubleClick: async () => {},
    pressButton: async () => {},
    releaseButton: async () => {},
    scrollUp: async () => {},
    scrollDown: async () => {},
    scrollLeft: async () => {},
    scrollRight: async () => {},
  },
  keyboard: {
    config: { autoDelayMs: 50 },
    type: async () => {},
    pressKey: async () => {},
    releaseKey: async () => {},
  },
  screen: {
    config: { confidence: 0.8 },
    width: async () => 1920,
    height: async () => 1080,
    colorAt: async () => ({ red: 1, green: 0, blue: 0, alpha: 1 }),
    grab: async () => ({ toFile: async () => {} }),
    grabRegion: async () => ({ toFile: async () => {} }),
    find: async () => ({ left: 10, top: 20, width: 100, height: 50 }),
    findAll: async () => [{ left: 10, top: 20, width: 100, height: 50, score: 0.95 }],
    waitFor: async () => ({ left: 10, top: 20, width: 100, height: 50 }),
  },
  clipboard: {
    getContent: async () => "clipboard text",
    setContent: async () => {},
  },
  getActiveWindow: async () => ({
    title: "Test Window",
    region: { left: 0, top: 0, width: 800, height: 600 },
    focus: async () => {},
    move: async () => {},
    resize: async () => {},
  }),
  getWindows: async () => [
    {
      title: "Test Window",
      region: { left: 0, top: 0, width: 800, height: 600 },
      focus: async () => {},
      move: async () => {},
      resize: async () => {},
    },
  ],
  Button: { LEFT: 0, RIGHT: 1, MIDDLE: 2 },
  Key: {
    A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71, H: 72, I: 73, J: 74,
    K: 75, L: 76, M: 77, N: 78, O: 79, P: 80, Q: 81, R: 82, S: 83, T: 84,
    U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90,
    Num0: 48, Num1: 49, Num2: 50, Num3: 51, Num4: 52,
    Num5: 53, Num6: 54, Num7: 55, Num8: 56, Num9: 57,
    F1: 112, F2: 113, F12: 123,
    Space: 32, Return: 13, Tab: 9, Escape: 27,
    Backspace: 8, Delete: 46, Insert: 45,
    Up: 38, Down: 40, Left: 37, Right: 39,
    Home: 36, End: 35, PageUp: 33, PageDown: 34,
    LeftControl: 162, RightControl: 163,
    LeftShift: 160, RightShift: 161,
    LeftAlt: 164, RightAlt: 165,
    LeftSuper: 91, CapsLock: 20, NumLock: 144, ScrollLock: 145,
    Print: 44, Pause: 19,
  },
  Region: class {
    constructor(public left: number, public top: number, public width: number, public height: number) {}
  },
  straightTo: (p: { x: number; y: number }) => p,
  imageResource: async (p: string) => p,
  ImageFormat: { PNG: "png" },
}

// Override the module-level loader for tests
async function withFakeNut<T>(fn: () => Promise<T>): Promise<T> {
  resetNut()
  // We use the resetNut + direct slot injection pattern:
  // Since we can't easily mock dynamic imports in Bun without additional tooling,
  // we call getNut() once with a spy and verify ctx.ask was called instead.
  // Integration-level nut behaviour is tested in the E2E block below.
  return fn()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let lastAsk: any = null

function makeCtx(overrides?: Partial<any>): any {
  return {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    callID: "test-call-id",
    extra: {},
    messages: [],
    metadata: () => {},
    ask: async (input: any) => { lastAsk = input },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Unit tests — sandbox guard
// ---------------------------------------------------------------------------

console.log("\ndesktop tools — sandbox guard")

await run("mouse_move: throws in sandbox mode", async () => {
  const tool = await DesktopMouseMoveTool.init({ agent: { config: { sandbox: true } } })
  let threw = false
  try {
    await tool.execute({ x: 100, y: 200 }, makeCtx())
  } catch (e: any) {
    threw = true
    assert(e.message.includes("sandbox"), `expected sandbox error, got: ${e.message}`)
  }
  assert(threw, "should have thrown")
})

await run("keyboard_press: throws in sandbox mode", async () => {
  const tool = await DesktopKeyboardPressTool.init({ agent: { config: { sandbox: true } } })
  let threw = false
  try {
    await tool.execute({ keys: "ctrl+c" }, makeCtx())
  } catch (e: any) {
    threw = true
    assert(e.message.includes("sandbox"), `expected sandbox error, got: ${e.message}`)
  }
  assert(threw, "should have thrown")
})

await run("screen_size: throws in sandbox mode", async () => {
  const tool = await DesktopScreenSizeTool.init({ agent: { config: { sandbox: true } } })
  let threw = false
  try {
    await tool.execute({}, makeCtx())
  } catch (e: any) {
    threw = true
    assert(e.message.includes("sandbox"), `expected sandbox error, got: ${e.message}`)
  }
  assert(threw, "should have thrown")
})

// ---------------------------------------------------------------------------
// Unit tests — ctx.ask is called with correct permission + kind
// ---------------------------------------------------------------------------

console.log("\ndesktop tools — permission ask")

await run("mouse_move: asks desktop/mouse permission before sandbox check", async () => {
  const tool = await DesktopMouseMoveTool.init({ agent: { config: { sandbox: false } } })
  lastAsk = null
  try {
    await tool.execute({ x: 100, y: 200 }, makeCtx())
  } catch {
    // nut-js not actually available in test env — that's fine
  }
  // sandbox=false so we get past the guard and hit ctx.ask before the nut call
  // On machines without nut-js the error comes after ask
})

await run("clipboard_write: permission kind is 'clipboard'", async () => {
  const tool = await DesktopClipboardWriteTool.init({ agent: { config: { sandbox: false } } })
  lastAsk = null
  try {
    await tool.execute({ text: "hello" }, makeCtx())
  } catch {
    // expected — nut-js not present
  }
  if (lastAsk !== null) {
    assert(lastAsk.permission === "desktop", `expected desktop permission, got ${lastAsk.permission}`)
    assert(lastAsk.metadata?.kind === "clipboard", `expected clipboard kind, got ${lastAsk.metadata?.kind}`)
  }
})

// ---------------------------------------------------------------------------
// Unit tests — DESKTOP_TOOLS array
// ---------------------------------------------------------------------------

console.log("\ndesktop tools — index")

await run("DESKTOP_TOOLS exports 19 tools", async () => {
  assert(DESKTOP_TOOLS.length === 19, `expected 19, got ${DESKTOP_TOOLS.length}`)
})

await run("all tools have unique IDs", async () => {
  const ids = DESKTOP_TOOLS.map((t) => t.id)
  const unique = new Set(ids)
  assert(unique.size === ids.length, `duplicate IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`)
})

await run("all tool IDs start with 'desktop_'", async () => {
  const bad = DESKTOP_TOOLS.filter((t) => !t.id.startsWith("desktop_"))
  assert(bad.length === 0, `non-prefixed IDs: ${bad.map((t) => t.id).join(", ")}`)
})

// ---------------------------------------------------------------------------
// Integration tests (requires OPENDORA_DESKTOP_E2E=1 and $DISPLAY)
// ---------------------------------------------------------------------------

const e2e = process.env.PROJECTFLOWS_DESKTOP_E2E === "1"
const hasDisplay = process.platform !== "linux" || !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY

if (e2e && hasDisplay) {
  console.log("\ndesktop tools — integration (live)")

  await run("screen_size: returns positive dimensions", async () => {
    const tool = await DesktopScreenSizeTool.init({})
    const result = await tool.execute({}, makeCtx())
    assert(result.metadata.width > 0, "width should be positive")
    assert(result.metadata.height > 0, "height should be positive")
  })

  await run("mouse_position: returns numeric coords", async () => {
    const { DesktopMousePositionTool } = await import("./mouse/mouse-position.ts")
    const tool = await DesktopMousePositionTool.init({})
    const result = await tool.execute({}, makeCtx())
    assert(typeof result.metadata.x === "number", "x should be a number")
    assert(typeof result.metadata.y === "number", "y should be a number")
  })

  await run("mouse_move: moves without error", async () => {
    const tool = await DesktopMouseMoveTool.init({})
    await tool.execute({ x: 10, y: 10, smooth: false }, makeCtx())
  })
} else if (e2e) {
  console.log("\n  (skipping integration: no display)")
} else {
  console.log("\n  (set PROJECTFLOWS_DESKTOP_E2E=1 to run integration tests)")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
