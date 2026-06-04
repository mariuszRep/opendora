export function state<T>(init: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined
  return () => (promise ??= init())
}
