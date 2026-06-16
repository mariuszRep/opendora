import fs from "node:fs/promises"
import path from "node:path"
import { execFileUtf8 } from "./exec-file"
import { resolveServerLaunchAgentLabel } from "./constants"
import { resolveHomeDir, resolveServerStateDir } from "./paths"
import { toPosixPath } from "./output"
import { buildLaunchAgentPlist } from "./launchd-plist"
import type {
  ServiceInstallArgs,
  ServiceManageArgs,
  ServiceControlArgs,
  ServiceEnvArgs,
  ServiceCommandConfig,
  ServiceEnv,
} from "./service-types"
import type { ServiceRuntime } from "./service-runtime"

function resolveLaunchAgentPlistPath(env: ServiceEnv): string {
  const home = toPosixPath(resolveHomeDir(env))
  const label = resolveServerLaunchAgentLabel()
  return path.posix.join(home, "Library", "LaunchAgents", `${label}.plist`)
}

function resolveLogPaths(env: ServiceEnv): { logDir: string; stdoutPath: string; stderrPath: string } {
  const stateDir = resolveServerStateDir(env)
  const logDir = path.join(stateDir, "logs")
  return {
    logDir,
    stdoutPath: path.join(logDir, "opendora.log"),
    stderrPath: path.join(logDir, "opendora.err.log"),
  }
}

export async function installLaunchAgent(args: ServiceInstallArgs): Promise<void> {
  const plistPath = resolveLaunchAgentPlistPath(args.env)
  const plistDir = path.dirname(plistPath)
  await fs.mkdir(plistDir, { recursive: true, mode: 0o755 })

  const { logDir, stdoutPath, stderrPath } = resolveLogPaths(args.env)
  await fs.mkdir(logDir, { recursive: true, mode: 0o755 })

  const plistContent = buildLaunchAgentPlist({
    label: resolveServerLaunchAgentLabel(),
    comment: args.description,
    programArguments: args.programArguments,
    workingDirectory: args.workingDirectory,
    stdoutPath,
    stderrPath,
    environment: args.environment,
  })

  await fs.writeFile(plistPath, plistContent, { mode: 0o644 })
  await execFileUtf8("launchctl", ["load", plistPath])
}

export async function uninstallLaunchAgent(args: ServiceManageArgs): Promise<void> {
  const plistPath = resolveLaunchAgentPlistPath(args.env)
  await execFileUtf8("launchctl", ["unload", plistPath]).catch(() => {})
  await fs.unlink(plistPath).catch(() => {})
}

export async function stopLaunchAgent(args: ServiceControlArgs): Promise<void> {
  const label = resolveServerLaunchAgentLabel()
  await execFileUtf8("launchctl", ["stop", label])
}

export async function restartLaunchAgent(args: ServiceControlArgs): Promise<void> {
  const label = resolveServerLaunchAgentLabel()
  const uid = process.getuid?.() ?? 501
  await execFileUtf8("launchctl", ["kickstart", "-k", `gui/${uid}/${label}`])
}

export async function isLaunchAgentLoaded(args: ServiceEnvArgs): Promise<boolean> {
  const label = resolveServerLaunchAgentLabel()
  const result = await execFileUtf8("launchctl", ["list", label])
  return result.code === 0
}

export async function readLaunchAgentProgramArguments(env: ServiceEnv): Promise<ServiceCommandConfig | null> {
  const plistPath = resolveLaunchAgentPlistPath(env)
  try {
    await fs.access(plistPath)
    return { programArguments: [], sourcePath: plistPath }
  } catch {
    return null
  }
}

export async function readLaunchAgentRuntime(env: ServiceEnv): Promise<ServiceRuntime> {
  const label = resolveServerLaunchAgentLabel()
  const result = await execFileUtf8("launchctl", ["list", label])

  if (result.code !== 0) {
    return { status: "stopped" }
  }

  const lines = result.stdout.split("\n")
  for (const line of lines) {
    if (line.includes("PID")) {
      const match = line.match(/PID\s*=\s*(\d+)/)
      if (match) {
        return { status: "running", pid: parseInt(match[1], 10) }
      }
    }
  }

  return { status: "running" }
}
