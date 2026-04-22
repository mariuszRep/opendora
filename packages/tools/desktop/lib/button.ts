import { getNut } from "./nut.ts"

export type ButtonName = "left" | "right" | "middle"

export async function resolveButton(name: ButtonName | undefined) {
  const { Button } = await getNut()
  switch (name ?? "left") {
    case "left":
      return Button.LEFT
    case "right":
      return Button.RIGHT
    case "middle":
      return Button.MIDDLE
  }
}
