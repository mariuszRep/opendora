import { parseKeys } from "./keys.ts"

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

console.log("keys.ts — key parser")

await run("single letter 'a'", async () => {
  const keys = await parseKeys("a")
  assert(keys.length === 1, "should return 1 key")
})

await run("uppercase letter treated as lowercase 'A'", async () => {
  const keys = await parseKeys("A")
  assert(keys.length === 1, "should return 1 key")
})

await run("ctrl+c combo", async () => {
  const keys = await parseKeys("ctrl+c")
  assert(keys.length === 2, `expected 2 keys, got ${keys.length}`)
})

await run("ctrl+shift+t combo", async () => {
  const keys = await parseKeys("ctrl+shift+t")
  assert(keys.length === 3, `expected 3 keys, got ${keys.length}`)
})

await run("enter alias", async () => {
  const keys = await parseKeys("enter")
  assert(keys.length === 1, "should return 1 key")
})

await run("esc alias", async () => {
  const keys = await parseKeys("esc")
  assert(keys.length === 1, "should return 1 key")
})

await run("f1 function key", async () => {
  const keys = await parseKeys("f1")
  assert(keys.length === 1, "should return 1 key")
})

await run("f12 function key", async () => {
  const keys = await parseKeys("f12")
  assert(keys.length === 1, "should return 1 key")
})

await run("digit '0'", async () => {
  const keys = await parseKeys("0")
  assert(keys.length === 1, "should return 1 key")
})

await run("unknown key throws with helpful message", async () => {
  let threw = false
  try {
    await parseKeys("ctrl+unknownkey")
  } catch (e: any) {
    threw = true
    assert(e.message.includes("unknownkey"), "error should mention the bad key")
    assert(e.message.includes("Supported"), "error should list supported keys")
  }
  assert(threw, "should have thrown for unknown key")
})

await run("meta/cmd/win/super all work", async () => {
  for (const alias of ["meta", "cmd", "win", "super", "command"]) {
    const keys = await parseKeys(alias)
    assert(keys.length === 1, `${alias} should return 1 key`)
  }
})

await run("pageup/pgup aliases", async () => {
  const a = await parseKeys("pageup")
  const b = await parseKeys("pgup")
  assert(a.length === 1 && b.length === 1, "both aliases should work")
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
