export { Tool } from "@opendora/tools/tool"

// Wire up real disk-backed truncation for the opencode runtime.
// Imported for side-effects: configure() runs once when this module loads.
import { configure } from "@opendora/tools/truncation"
import { Truncate } from "./truncation"
configure((text, agent) => Truncate.output(text, {}, agent as any))
