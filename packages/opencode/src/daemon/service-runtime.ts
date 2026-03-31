export type ServiceRuntimeStatus = "running" | "stopped" | "unknown";

export type ServiceRuntime = {
  status: ServiceRuntimeStatus;
  detail?: string;
  pid?: number;
  missingUnit?: boolean;
};
