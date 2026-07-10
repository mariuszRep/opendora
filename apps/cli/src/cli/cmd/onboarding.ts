import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { PluginInstaller } from "@projectflows/plugin"
import { Onboarding } from "@projectflows/plugin/onboarding"
import { CatalogReader } from "@projectflows/plugin/catalog"
import { CoreSetup } from "@projectflows/server/core-setup"

export async function runOnboarding(opts: { revisit?: boolean } = {}): Promise<void> {
  // Skip if onboarding was already done OR core is already installed (e.g. via install.sh / dev:setup)
  if (!opts.revisit && ((await Onboarding.isComplete()) || (await CoreSetup.isComplete()))) return

  const packs = await CatalogReader.listPacks()

  UI.empty()
  prompts.intro("Projectflows — Capability Setup")

  if (packs.length === 0) {
    prompts.log.warn(
      "No capability packs found. Set PROJECTFLOWS_PLUGINS_CATALOG to your local plugins repo path, then re-run.",
    )
    prompts.outro("Skipped — no packs available.")
    await Onboarding.write({
      completedAt: new Date().toISOString(),
      skipped: true,
      selectedPacks: [],
      installedPlugins: [],
    })
    return
  }

  const selected = await prompts.select({
    message: "Choose a capability pack to get started:",
    options: [
      ...packs.map((pack) => ({
        value: pack.id,
        label: pack.name,
        hint: pack.description,
      })),
      { value: "__skip__", label: "Skip", hint: "bare minimum — choose later from settings" },
    ],
  })

  if (prompts.isCancel(selected) || selected === "__skip__") {
    await Onboarding.write({
      completedAt: new Date().toISOString(),
      skipped: true,
      selectedPacks: [],
      installedPlugins: [],
    })
    prompts.outro("Skipped. Run 'projectflows onboarding' to install packs later.")
    return
  }

  const pack = packs.find((p) => p.id === selected)!
  const installed: string[] = []
  const failed: string[] = []

  for (const pluginId of pack.plugins) {
    const spinner = prompts.spinner()
    spinner.start(`Installing ${pluginId}…`)
    let stagingDir: string | undefined
    try {
      stagingDir = await CatalogReader.buildPluginStaging(pluginId)
      await PluginInstaller.install({ sourcePath: stagingDir, scope: "global" })
      installed.push(pluginId)
      spinner.stop(`${pluginId} installed`)
    } catch (err) {
      failed.push(pluginId)
      spinner.stop(`${pluginId} failed: ${err instanceof Error ? err.message : String(err)}`, 1)
    } finally {
      if (stagingDir) await import("fs/promises").then((f) => f.rm(stagingDir!, { recursive: true, force: true })).catch(() => {})
    }
  }

  await Onboarding.write({
    completedAt: new Date().toISOString(),
    skipped: false,
    selectedPacks: [pack.id],
    installedPlugins: installed,
  })

  if (failed.length > 0) {
    prompts.log.warn(`${failed.length} plugin(s) failed to install: ${failed.join(", ")}`)
  }
  prompts.outro(`Done! Installed ${installed.length} plugin(s) from "${pack.name}".`)
}

export const OnboardingCommand = cmd({
  command: "onboarding",
  describe: "Select and install capability packs",
  builder: (yargs) =>
    yargs
      .option("revisit", {
        alias: "r",
        describe: "Re-run onboarding even if already completed",
        type: "boolean",
        default: false,
      })
      .option("skip", {
        alias: "s",
        describe: "Skip onboarding and use bare minimum",
        type: "boolean",
        default: false,
      }),
  async handler(args) {
    if (args.skip) {
      await Onboarding.write({
        completedAt: new Date().toISOString(),
        skipped: true,
        selectedPacks: [],
        installedPlugins: [],
      })
      UI.empty()
      prompts.intro("Projectflows — Capability Setup")
      prompts.outro("Skipped. Run 'projectflows onboarding' to install packs later.")
      return
    }
    await runOnboarding({ revisit: args.revisit })
  },
})
