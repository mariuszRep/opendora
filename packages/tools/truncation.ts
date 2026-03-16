export type TruncateResult =
  | { content: string; truncated: false }
  | { content: string; truncated: true; outputPath: string }

export type Truncator = (text: string, agent?: unknown) => Promise<TruncateResult>

let _fn: Truncator = async (text) => ({ content: text, truncated: false })

export function configure(fn: Truncator) {
  _fn = fn
}

export async function apply(text: string, agent?: unknown): Promise<TruncateResult> {
  return _fn(text, agent)
}
