export type ServiceEnv = Record<string, string | undefined>;

export type ServiceInstallArgs = {
  env: ServiceEnv;
  stdout: NodeJS.WritableStream;
  programArguments: string[];
  workingDirectory?: string;
  environment?: ServiceEnv;
  description?: string;
};

export type ServiceManageArgs = {
  env: ServiceEnv;
  stdout: NodeJS.WritableStream;
};

export type ServiceControlArgs = {
  stdout: NodeJS.WritableStream;
  env?: ServiceEnv;
};

export type ServiceEnvArgs = {
  env?: ServiceEnv;
};

export type ServiceCommandConfig = {
  programArguments: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  environmentValueSources?: Record<string, "inline" | "file">;
  sourcePath?: string;
};

export type ServiceRenderArgs = {
  description?: string;
  programArguments: string[];
  workingDirectory?: string;
  environment?: ServiceEnv;
};
