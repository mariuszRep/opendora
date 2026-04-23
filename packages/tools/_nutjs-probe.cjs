// Systematic nut-js probe against the live WSLg display with xeyes running.
const nut = require("@nut-tree-fork/nut-js");
const { screen, mouse, keyboard, clipboard, getActiveWindow, getWindows, Region, Point, Button, Key } = nut;

function label(s) { console.log("\n=== " + s + " ==="); }
async function safe(name, fn) {
  try {
    const r = await fn();
    console.log("OK  " + name + ":", r === undefined ? "(void)" : JSON.stringify(r).slice(0, 200));
    return r;
  } catch (e) {
    console.log("ERR " + name + ":", String(e && e.message || e).split("\n")[0]);
    return null;
  }
}

label("screen.size");
await safe("screen.width",  () => screen.width());
await safe("screen.height", () => screen.height());

label("screen.grab");
await safe("screen.grab full", async () => { const i = await screen.grab(); return { w: i.width, h: i.height }; });
await safe("screen.grabRegion xeyes(2970,596 400x300)", async () => {
  const i = await screen.grabRegion(new Region(2970, 596, 400, 300));
  return { w: i.width, h: i.height };
});
await safe("screen.colorAt(3000,700)", async () => {
  const c = await screen.colorAt(new Point(3000, 700));
  return c;
});

label("mouse");
await safe("mouse.getPosition", () => mouse.getPosition());
await safe("mouse.setPosition(500,500)", () => mouse.setPosition(new Point(500, 500)));
await safe("mouse.getPosition after set", () => mouse.getPosition());
await safe("mouse.leftClick", () => mouse.leftClick());
await safe("mouse.scrollDown(3)", () => mouse.scrollDown(3));
await safe("mouse.pressButton(LEFT) + move + releaseButton (drag)", async () => {
  await mouse.setPosition(new Point(600, 600));
  await mouse.pressButton(Button.LEFT);
  await mouse.setPosition(new Point(700, 700));
  await mouse.releaseButton(Button.LEFT);
  return "ok";
});

label("keyboard");
await safe("keyboard.type('hello')", () => keyboard.type("hello"));
await safe("keyboard.pressKey(Key.A) + releaseKey(Key.A)", async () => {
  await keyboard.pressKey(Key.A);
  await keyboard.releaseKey(Key.A);
  return "ok";
});

label("clipboard");
await safe("clipboard.setContent('cb-test-123')", () => clipboard.setContent("cb-test-123"));
await safe("clipboard.getContent", () => clipboard.getContent());

label("windows");
await safe("getActiveWindow().title", async () => { const w = await getActiveWindow(); return await w.getTitle(); });
await safe("getActiveWindow().getRegion", async () => { const w = await getActiveWindow(); const r = await w.getRegion(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
await safe("getWindows(): titles", async () => {
  const ws = await getWindows();
  const out = [];
  for (const w of ws) {
    const t = await w.getTitle().catch(() => "<err>");
    out.push(t);
  }
  return out;
});
await safe("find window matching 'xeyes' then focus+move+resize", async () => {
  const ws = await getWindows();
  let target = null;
  for (const w of ws) {
    const t = await w.getTitle().catch(() => "");
    if (/eyes/i.test(t)) { target = w; break; }
  }
  if (!target) return "no xeyes window found by title";
  await target.focus?.();
  await target.move?.(new Point(800, 400));
  await target.resize?.({ width: 500, height: 400 });
  return "attempted";
});
