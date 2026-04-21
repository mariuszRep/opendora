export type ButtonName = "left" | "right" | "middle"

export async function resolveButton(name: ButtonName | undefined) {
  const { Button } = await import("@nut-tree-fork/nut-js")
  switch (name ?? "left") {
    case "left":
      return Button.LEFT
    case "right":
      return Button.RIGHT
    case "middle":
      return Button.MIDDLE
  }
}
