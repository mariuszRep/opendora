type ConfigReader = () => Promise<Record<string, any>>

let reader: ConfigReader | undefined

export function register(fn: ConfigReader): void {
  reader = fn
}

export function get(): Promise<Record<string, any>> {
  return reader ? reader() : Promise.resolve({})
}
