import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import {
  PluginInstaller,
  PluginCoreRequiredError,
  PluginHasDependentsError,
  PluginConflictError,
} from "@projectflows/plugin"

export const PluginCommand = cmd({
  command: "plugin",
  describe: "manage plugins",
  builder: (yargs) =>
    yargs
      .command(PluginInstallCommand)
      .command(PluginListCommand)
      .command(PluginInfoCommand)
      .command(PluginRemoveCommand)
      .command(PluginEnableCommand)
      .command(PluginDisableCommand)
      .demandCommand(),
  async handler() {},
})

export const PluginInstallCommand = cmd({
  command: "install",
  describe: "install a plugin from a local path",
  builder: (yargs) =>
    yargs
      .option("path", {
        alias: "p",
        describe: "path to the plugin directory",
        type: "string",
        demandOption: true,
      })
      .option("scope", {
        alias: "s",
        describe: "install scope",
        type: "string",
        choices: ["global", "project"] as const,
        default: "global" as const,
      }),
  async handler(args) {
    UI.empty()
    prompts.intro("Plugin Install")
    const spinner = prompts.spinner()
    spinner.start(`Installing plugin from ${args.path}...`)
    try {
      const item = await PluginInstaller.install({
        sourcePath: args.path,
        scope: args.scope as "global" | "project",
      })
      spinner.stop(`Installed ${item.pluginId}@${item.version}`)
      prompts.log.success(
        `Plugin "${item.pluginId}" installed (${item.scope} scope, ${item.capabilities.length} capabilities)`,
      )
    } catch (err) {
      spinner.stop("Installation failed", 1)
      if (err instanceof PluginConflictError) {
        prompts.log.error(err.message)
        prompts.log.info(`Run: plugin remove ${err.pluginId}  — then install again`)
      } else {
        prompts.log.error(err instanceof Error ? err.message : String(err))
      }
    }
    prompts.outro("Done")
  },
})

export const PluginListCommand = cmd({
  command: "list",
  aliases: ["ls"],
  describe: "list installed plugins",
  async handler() {
    UI.empty()
    prompts.intro("Installed Plugins")
    const plugins = await PluginInstaller.list()
    if (plugins.length === 0) {
      prompts.log.warn("No plugins installed")
      prompts.outro("Install a plugin with: plugin install --path /path/to/plugin")
      return
    }
    for (const p of plugins) {
      const status = p.enabled ? "✓" : "○"
      const caps = `${p.capabilities.length} cap${p.capabilities.length !== 1 ? "s" : ""}`
      prompts.log.info(
        `${status} ${p.pluginId}@${p.version} ${UI.Style.TEXT_DIM}[${p.scope}] ${caps}`,
      )
    }
    prompts.outro(`${plugins.length} plugin(s)`)
  },
})

export const PluginInfoCommand = cmd({
  command: "info <plugin-id>",
  describe: "show detailed info for an installed plugin",
  builder: (yargs) =>
    yargs.positional("plugin-id", {
      describe: "plugin id",
      type: "string",
      demandOption: true,
    }),
  async handler(args) {
    UI.empty()
    prompts.intro("Plugin Info")
    const item = await PluginInstaller.info(args["plugin-id"] as string)
    if (!item) {
      prompts.log.error(`Plugin not found: ${args["plugin-id"]}`)
      prompts.outro("Done")
      return
    }
    prompts.log.info(`ID:           ${item.pluginId}`)
    prompts.log.info(`Version:      ${item.version}`)
    prompts.log.info(`Scope:        ${item.scope}`)
    prompts.log.info(`Source:       ${item.source}`)
    prompts.log.info(`Status:       ${item.enabled ? "enabled" : "disabled"}`)
    prompts.log.info(`Installed at: ${item.installedAt}`)
    prompts.log.info(`Capabilities: ${item.capabilities.map((c) => `${c.type}:${c.name}`).join(", ") || "(none)"}`)
    if (item.dependencies?.length) {
      prompts.log.info(`Dependencies: ${item.dependencies.join(", ")}`)
    }
    prompts.outro("Done")
  },
})

export const PluginRemoveCommand = cmd({
  command: "remove <plugin-id>",
  aliases: ["rm", "uninstall"],
  describe: "remove an installed plugin",
  builder: (yargs) =>
    yargs
      .positional("plugin-id", {
        describe: "plugin id",
        type: "string",
        demandOption: true,
      })
      .option("scope", {
        alias: "s",
        describe: "scope to remove from",
        type: "string",
        choices: ["global", "project"] as const,
        default: "global" as const,
      }),
  async handler(args) {
    UI.empty()
    prompts.intro("Plugin Remove")
    const spinner = prompts.spinner()
    spinner.start(`Removing ${args["plugin-id"]}...`)
    try {
      await PluginInstaller.remove(args["plugin-id"] as string, {
        scope: args.scope as "global" | "project",
      })
      spinner.stop(`Removed ${args["plugin-id"]}`)
      prompts.log.success(`Plugin "${args["plugin-id"]}" removed`)
    } catch (err) {
      spinner.stop("Removal failed", 1)
      if (err instanceof PluginCoreRequiredError) {
        prompts.log.error(`Cannot remove "${err.pluginId}": it provides core-required capabilities`)
      } else if (err instanceof PluginHasDependentsError) {
        prompts.log.error(`Cannot remove "${err.pluginId}": the following plugins depend on it:`)
        prompts.log.info(err.dependents.join(", "))
        prompts.log.info("Remove those plugins first.")
      } else {
        prompts.log.error(err instanceof Error ? err.message : String(err))
      }
    }
    prompts.outro("Done")
  },
})

export const PluginEnableCommand = cmd({
  command: "enable <plugin-id>",
  describe: "enable a disabled plugin",
  builder: (yargs) =>
    yargs
      .positional("plugin-id", {
        describe: "plugin id",
        type: "string",
        demandOption: true,
      })
      .option("scope", {
        alias: "s",
        type: "string",
        choices: ["global", "project"] as const,
        default: "global" as const,
      }),
  async handler(args) {
    UI.empty()
    await PluginInstaller.setEnabled(args["plugin-id"] as string, true, {
      scope: args.scope as "global" | "project",
    })
    prompts.log.success(`Plugin "${args["plugin-id"]}" enabled`)
  },
})

export const PluginDisableCommand = cmd({
  command: "disable <plugin-id>",
  describe: "disable an installed plugin without removing it",
  builder: (yargs) =>
    yargs
      .positional("plugin-id", {
        describe: "plugin id",
        type: "string",
        demandOption: true,
      })
      .option("scope", {
        alias: "s",
        type: "string",
        choices: ["global", "project"] as const,
        default: "global" as const,
      }),
  async handler(args) {
    UI.empty()
    await PluginInstaller.setEnabled(args["plugin-id"] as string, false, {
      scope: args.scope as "global" | "project",
    })
    prompts.log.success(`Plugin "${args["plugin-id"]}" disabled`)
  },
})
