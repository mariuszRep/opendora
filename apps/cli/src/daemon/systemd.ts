import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFileUtf8 } from "./exec-file"
import { resolveServerSystemdServiceName } from "./constants"
import { resolveHomeDir } from "./paths"
import { toPosixPath } from "./output"
import { buildSystemdUnit, parseSystemdExecStart, parseSystemdEnvAssignment } from "./systemd-unit"
import type {
  ServiceInstallArgs,
  ServiceManageArgs,
  ServiceControlArgs,
  ServiceEnvArgs,
  ServiceCommandConfig,
  ServiceEnv,
} from "./service-types"
import type { ServiceRuntime } from "./service-runtime"

function resolveSystemdUnitPath(env: ServiceEnv): string {
  const home = toPosixPath(resolveHomeDir(env))
  const serviceName = resolveServerSystemdServiceName()
  return path.posix.join(home, ".config", "systemd", "user", `${serviceName}.service`)
}

export async function installSystemdService(args: ServiceInstallArgs): Promise<void> {
  const unitPath = resolveSystemdUnitPath(args.env)
  const unitDir = path.dirname(unitPath)
  await fs.mkdir(unitDir, { recursive: true, mode: 0o755 })
  
  const unitContent = buildSystemdUnit({
    description: args.description,
    programArguments: args.programArguments,
    workingDirectory: args.workingDirectory,
    environment: args.environment,
  })
  
  await fs.writeFile(unitPath, unitContent, { mode: 0o644 })
  await execFileUtf8("systemctl", ["--user", "daemon-reload"])
  await execFileUtf8("systemctl", ["--user", "enable", resolveServerSystemdServiceName()])
}

export async function uninstallSystemdService(args: ServiceManageArgs): Promise<void> {
  const serviceName = resolveServerSystemdServiceName()
  await execFileUtf8("systemctl", ["--user", "disable", serviceName]).catch(() => {})
  await execFileUtf8("systemctl", ["--user", "stop", serviceName]).catch(() => {})
  
  const unitPath = resolveSystemdUnitPath(args.env)
  await fs.unlink(unitPath).catch(() => {})
  await execFileUtf8("systemctl", ["--user", "daemon-reload"])
}

export async function stopSystemdService(args: ServiceControlArgs): Promise<void> {
  const serviceName = resolveServerSystemdServiceName()
  await execFileUtf8("systemctl", ["--user", "stop", serviceName])
}

export async function restartSystemdService(args: ServiceControlArgs): Promise<void> {
  const serviceName = resolveServerSystemdServiceName()
  await execFileUtf8("systemctl", ["--user", "restart", serviceName])
}

export async function isSystemdServiceEnabled(args: ServiceEnvArgs): Promise<boolean> {
  const serviceName = resolveServerSystemdServiceName()
  const result = await execFileUtf8("systemctl", ["--user", "is-enabled", serviceName])
  return result.code === 0
}

export async function readSystemdServiceExecStart(env: ServiceEnv): Promise<ServiceCommandConfig | null> {
  const unitPath = resolveSystemdUnitPath(env)
  try {
    const content = await fs.readFile(unitPath, "utf8")
    let execStart = ""
    let workingDirectory = ""
    const environment: Record<string, string> = {}
    
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      
      if (line.startsWith("ExecStart=")) {
        execStart = line.slice("ExecStart=".length).trim()
      } else if (line.startsWith("WorkingDirectory=")) {
        workingDirectory = line.slice("WorkingDirectory=".length).trim()
      } else if (line.startsWith("Environment=")) {
        const raw = line.slice("Environment=".length).trim()
        const parsed = parseSystemdEnvAssignment(raw)
        if (parsed) {
          environment[parsed.key] = parsed.value
        }
      }
    }
    
    if (!execStart) return null
    
    return {
      programArguments: parseSystemdExecStart(execStart),
      workingDirectory: workingDirectory || undefined,
      environment: Object.keys(environment).length > 0 ? environment : undefined,
      sourcePath: unitPath,
    }
  } catch {
    return null
  }
}

export async function readSystemdServiceRuntime(env: ServiceEnv): Promise<ServiceRuntime> {
  const serviceName = resolveServerSystemdServiceName()
  const result = await execFileUtf8("systemctl", ["--user", "show", serviceName, "--property=ActiveState,SubState,MainPID"])
  
  if (result.code !== 0) {
    return { status: "unknown", detail: result.stderr }
  }
  
  const lines = result.stdout.split("\n")
  let activeState = ""
  let mainPid: number | undefined
  
  for (const line of lines) {
    if (line.startsWith("ActiveState=")) {
      activeState = line.slice("ActiveState=".length).trim()
    } else if (line.startsWith("MainPID=")) {
      const pidStr = line.slice("MainPID=".length).trim()
      const pid = parseInt(pidStr, 10)
      if (pid > 0) mainPid = pid
    }
  }
  
  if (activeState === "active") {
    return { status: "running", pid: mainPid }
  } else if (activeState === "inactive" || activeState === "failed") {
    return { status: "stopped" }
  }
  
  return { status: "unknown", detail: activeState }
}

export async function isSystemdUserServiceAvailable(): Promise<boolean> {
  const result = await execFileUtf8("systemctl", ["--user", "--version"])
  return result.code === 0
}
