import type { Key as NutKey } from "@nut-tree-fork/nut-js"

type KeyMap = Record<string, keyof typeof NutKey>

const KEY_MAP: KeyMap = {
  // Modifiers
  ctrl: "LeftControl",
  control: "LeftControl",
  shift: "LeftShift",
  alt: "LeftAlt",
  option: "LeftAlt",
  meta: "LeftSuper",
  super: "LeftSuper",
  win: "LeftSuper",
  cmd: "LeftSuper",
  command: "LeftSuper",
  rctrl: "RightControl",
  rshift: "RightShift",
  ralt: "RightAlt",
  // Navigation
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pgup: "PageUp",
  pagedown: "PageDown",
  pgdn: "PageDown",
  pgdown: "PageDown",
  // Editing
  enter: "Return",
  return: "Return",
  esc: "Escape",
  escape: "Escape",
  space: "Space",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  insert: "Insert",
  ins: "Insert",
  // Lock / system
  capslock: "CapsLock",
  numlock: "NumLock",
  scrolllock: "ScrollLock",
  printscreen: "Print",
  prtsc: "Print",
  pause: "Pause",
}

export async function parseKeys(combo: string): Promise<NutKey[]> {
  const { getNut } = await import("./nut.ts")
  const { Key } = await getNut()

  const parts = combo
    .toLowerCase()
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean)

  const result: NutKey[] = []

  for (const part of parts) {
    const mapped = resolveKeyName(part, Key)
    if (mapped === undefined) {
      throw new Error(
        `Unknown key "${part}" in combo "${combo}".\n` +
          `Supported: letters (a-z), digits (0-9), f1-f12, ` +
          `${Object.keys(KEY_MAP).join(", ")}`,
      )
    }
    result.push(mapped)
  }

  return result
}

function resolveKeyName(part: string, Key: typeof NutKey): NutKey | undefined {
  // Named aliases
  const alias = KEY_MAP[part]
  if (alias) return (Key as unknown as Record<string, NutKey>)[alias]

  // Single letter a-z
  if (/^[a-z]$/.test(part)) return (Key as unknown as Record<string, NutKey>)[part.toUpperCase()]

  // Digit 0-9
  if (/^\d$/.test(part)) return (Key as unknown as Record<string, NutKey>)[`Num${part}`]

  // Function keys f1-f24
  const fMatch = part.match(/^f(\d{1,2})$/)
  if (fMatch) {
    const n = parseInt(fMatch[1]!, 10)
    if (n >= 1 && n <= 24) return (Key as unknown as Record<string, NutKey>)[`F${n}`]
  }

  return undefined
}
