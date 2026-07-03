import path from "path"
import fs from "fs/promises"
import { Global } from "@projectflows/util/global"

export interface OnboardingRecord {
  completedAt: string
  skipped: boolean
  selectedPacks: string[]
  installedPlugins: string[]
}

export namespace Onboarding {
  export function stateFile(): string {
    return path.join(Global.Path.config, "onboarding.json")
  }

  export async function read(): Promise<OnboardingRecord | null> {
    try {
      return JSON.parse(await fs.readFile(stateFile(), "utf-8")) as OnboardingRecord
    } catch {
      return null
    }
  }

  export async function write(record: OnboardingRecord): Promise<void> {
    await fs.writeFile(stateFile(), JSON.stringify(record, null, 2), "utf-8")
  }

  export async function isComplete(): Promise<boolean> {
    return (await read()) !== null
  }
}
