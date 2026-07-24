// Ad-hoc verification script: exercises enrichAgent's lazy-seed + reconcileDelegationTools
// logic directly (same functions configure-session-core.ts wires up), without needing a real
// LLM call. Run from repo root: bun run <this file>
import { Instance } from "@projectflows/runtime/instance"
import { configureSessionCore } from "@projectflows/server/configure-session-core"
import { PermissionNext } from "@projectflows/permission/next"
import { Agent } from "@projectflows/runtime/agent"
import { ToolRegistry } from "@projectflows/server/tool-registry"

await Instance.provide({
  directory: process.cwd(),
  fn: async () => {
    configureSessionCore()

    const pandora = await Agent.get("pandora")
    if (!pandora) throw new Error("pandora not found")
    console.log("pandora rules before:", PermissionNext.listRules("agent", "pandora"))

    // Call the same server-side toolRegistry.get(...) path a real session turn would use —
    // this is what invokes enrichAgent() internally.
    const { getConfig } = await import("@projectflows/session/config")
    const cfg = getConfig()
    const tools = await cfg.toolRegistry!.get({ modelID: "gpt-5.6-terra", providerID: "openai-codex" }, pandora)
    console.log("tools returned for pandora, agent__ ones:", Object.keys(tools).filter((k) => k.startsWith("agent__")))

    console.log("pandora rules after:", PermissionNext.listRules("agent", "pandora"))

    console.log("registry agent__ tools:", ToolRegistry.all().map((t) => t.id).filter((id) => id.startsWith("agent__")))
  },
})
