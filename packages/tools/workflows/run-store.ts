import { RunState, Workflow } from "./schema.ts"

const store = new Map<string, { run: RunState; workflow: Workflow }>()

export function getRunStore() {
  return store
}
