import { getNut } from "./nut.ts"

export interface RegionInput {
  x: number
  y: number
  width: number
  height: number
}

export async function resolveRegion(input: RegionInput) {
  const { Region } = await getNut()
  return new Region(input.x, input.y, input.width, input.height)
}
