import {
  installLaunchAgent,
  isLaunchAgentLoaded,
  readLaunchAgentProgramArguments,
  readLaunchAgentRuntime,
  restartLaunchAgent,
  stopLaunchAgent,
  uninstallLaunchAgent,
} from "./launchd"
import {
  installSystemdService,
  isSystemdServiceEnabled,
  readSystemdServiceExecStart,
  readSystemdServiceRuntime,
  restartSystemdService,
  stopSystemdService,
  uninstallSystemdService,
} from "./systemd"
import type { ServiceRuntime } from "./service-runtime"
import type {
  ServiceCommandConfig,
  ServiceControlArgs,
  ServiceEnv,
  ServiceEnvArgs,
  ServiceInstallArgs,
  ServiceManageArgs,
} from "./service-types"

export type Service = {
  label: string
  loadedText: string
  notLoadedText: string
  install: (args: ServiceInstallArgs) => Promise<void>
  uninstall: (args: ServiceManageArgs) => Promise<void>
  stop: (args: ServiceControlArgs) => Promise<void>
  restart: (args: ServiceControlArgs) => Promise<void>
  isLoaded: (args: ServiceEnvArgs) => Promise<boolean>
  readCommand: (env: ServiceEnv) => Promise<ServiceCommandConfig | null>
  readRuntime: (env: ServiceEnv) => Promise<ServiceRuntime>
}

type SupportedPlatform = "darwin" | "linux" | "win32"

const SERVICE_REGISTRY: Record<SupportedPlatform, Service> = {
  darwin: {
    label: "LaunchAgent",
    loadedText: "loaded",
    notLoadedText: "not loaded",
    install: installLaunchAgent,
    uninstall: uninstallLaunchAgent,
    stop: stopLaunchAgent,
    restart: restartLaunchAgent,
    isLoaded: isLaunchAgentLoaded,
    readCommand: readLaunchAgentProgramArguments,
    readRuntime: readLaunchAgentRuntime,
  },
  linux: {
    label: "systemd",
    loadedText: "enabled",
    notLoadedText: "disabled",
    install: installSystemdService,
    uninstall: uninstallSystemdService,
    stop: stopSystemdService,
    restart: restartSystemdService,
    isLoaded: isSystemdServiceEnabled,
    readCommand: readSystemdServiceExecStart,
    readRuntime: readSystemdServiceRuntime,
  },
  win32: {
    label: "Service",
    loadedText: "installed",
    notLoadedText: "not installed",
    install: async () => {
      throw new Error("Windows service management not yet implemented")
    },
    uninstall: async () => {},
    stop: async () => {},
    restart: async () => {},
    isLoaded: async () => false,
    readCommand: async () => null,
    readRuntime: async () => ({ status: "unknown" }),
  },
}

export function resolveService(): Service {
  const platform = process.platform as SupportedPlatform
  const service = SERVICE_REGISTRY[platform]
  if (!service) {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }
  return service
}
