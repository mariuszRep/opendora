// Service labels and names for OpenDora
export const SERVER_LAUNCH_AGENT_LABEL = "ai.opendora.server";
export const SERVER_SYSTEMD_SERVICE_NAME = "opendora-server";
export const SERVER_WINDOWS_TASK_NAME = "OpenDora Server";
export const SERVER_SERVICE_MARKER = "opendora";
export const SERVER_SERVICE_KIND = "server";

export function resolveServerLaunchAgentLabel(): string {
  return SERVER_LAUNCH_AGENT_LABEL;
}

export function resolveServerSystemdServiceName(): string {
  return SERVER_SYSTEMD_SERVICE_NAME;
}

export function resolveServerWindowsTaskName(): string {
  return SERVER_WINDOWS_TASK_NAME;
}

export function formatServerServiceDescription(params?: { version?: string }): string {
  const version = params?.version?.trim();
  if (!version) {
    return "OpenDora Server";
  }
  return `OpenDora Server (v${version})`;
}

export function resolveServerServiceDescription(params: {
  env: Record<string, string | undefined>;
  environment?: Record<string, string | undefined>;
  description?: string;
}): string {
  return (
    params.description ??
    formatServerServiceDescription({
      version: params.environment?.OPENDORA_SERVICE_VERSION ?? params.env.OPENDORA_SERVICE_VERSION,
    })
  );
}
