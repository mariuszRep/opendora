import { ToolRegistry } from "./packages/tools/system/registry.ts"

console.log("All tool IDs:")
const ids = ToolRegistry.ids()
console.log(ids)

console.log("\nSkill tools:")
const skillTools = ids.filter(id => id.startsWith("skill"))
console.log(skillTools)
