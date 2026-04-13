// Stub for openclaw/plugin-sdk/logging-core
export interface Logger {
  debug(message: string, ...args: any[]): void
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
  child(name: string): Logger
}

export function createLogger(name: string): Logger {
  const log = (level: string, message: string, ...args: any[]) => {
    console.log(`[${level}] [${name}]`, message, ...args)
  }

  return {
    debug: (msg, ...args) => log("DEBUG", msg, ...args),
    info: (msg, ...args) => log("INFO", msg, ...args),
    warn: (msg, ...args) => log("WARN", msg, ...args),
    error: (msg, ...args) => log("ERROR", msg, ...args),
    child: (childName) => createLogger(`${name}:${childName}`),
  }
}
