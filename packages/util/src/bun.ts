import z from "zod"
import path from "path"
import { text } from "node:stream/consumers"
import { Global } from "./global"
import { Log } from "./log"
import { Filesystem } from "./filesystem"
import { NamedError } from "./error"
import { Lock } from "./lock"
import { PackageRegistry } from "./bun-registry"
import { proxied } from "./proxied"
import { Process } from "./process"

export namespace BunProc {
  const log = Log.create({ service: "bun" })

  export async function run(cmd: string[], options?: Process.Options) {
    log.info("running", {
      cmd: [which(), ...cmd],
      ...options,
    })
    const result = Process.spawn([which(), ...cmd], {
      ...options,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ...options?.env,
        BUN_BE_BUN: "1",
      },
    })
    const code = await result.exited
    const stdout = result.stdout ? await text(result.stdout) : undefined
    const stderr = result.stderr ? await text(result.stderr) : undefined
    log.info("done", { code, stdout, stderr })
    if (code !== 0) {
      throw new Error(`Command failed with exit code ${code}`)
    }
    return result
  }

  export function which() {
    return process.execPath
  }

  export const InstallFailedError = NamedError.create(
    "BunInstallFailedError",
    z.object({
      pkg: z.string(),
      version: z.string(),
    }),
  )

  export async function install(pkg: string, version = "latest") {
    using _ = await Lock.write("bun-install")

    const mod = path.join(Global.Path.cache, "node_modules", pkg)
    const pkgjsonPath = path.join(Global.Path.cache, "package.json")
    const parsed = await Filesystem.readJson<{ dependencies: Record<string, string> }>(pkgjsonPath).catch(async () => {
      const result = { dependencies: {} as Record<string, string> }
      await Filesystem.writeJson(pkgjsonPath, result)
      return result
    })
    if (!parsed.dependencies) parsed.dependencies = {} as Record<string, string>
    const dependencies = parsed.dependencies
    const modExists = await Filesystem.exists(mod)
    const cachedVersion = dependencies[pkg]

    if (!modExists || !cachedVersion) {
      // continue to install
    } else if (version !== "latest" && cachedVersion === version) {
      return mod
    } else if (version === "latest") {
      const isOutdated = await PackageRegistry.isOutdated(pkg, cachedVersion, Global.Path.cache)
      if (!isOutdated) return mod
      log.info("Cached version is outdated, proceeding with install", { pkg, cachedVersion })
    }

    const args = [
      "add",
      "--force",
      "--exact",
      // TODO: get rid of this case (see: https://github.com/oven-sh/bun/issues/19936)
      ...(proxied() || process.env.CI ? ["--no-cache"] : []),
      "--cwd",
      Global.Path.cache,
      pkg + "@" + version,
    ]

    log.info("installing package using Bun's default registry resolution", { pkg, version })

    await BunProc.run(args, {
      cwd: Global.Path.cache,
    }).catch((e) => {
      throw new InstallFailedError({ pkg, version }, { cause: e })
    })

    let resolvedVersion = version
    if (version === "latest") {
      const installedPkg = await Filesystem.readJson<{ version?: string }>(path.join(mod, "package.json")).catch(
        () => null,
      )
      if (installedPkg?.version) {
        resolvedVersion = installedPkg.version
      }
    }

    parsed.dependencies[pkg] = resolvedVersion
    await Filesystem.writeJson(pkgjsonPath, parsed)
    return mod
  }
}
