import { ToolRegistry } from "./src/tool/registry";
import { Agent } from "./src/agent/agent";
import { Provider } from "./src/provider/provider";

async function run() {
  const model = { providerID: "openai", modelID: "gpt-4o" };
  const agent = await Agent.get("explore");
  console.log("Agent tools array:", agent.tools);
  
  // mock input
  const input = {
    agent,
    model,
    session: { id: "test" } as any,
    processor: { message: { id: "msg1" } } as any,
    bypassAgentCheck: false,
    messages: []
  };

  // We can't easily call prompt.ts/resolveTools because it has many dependencies.
  // Let's just emulate the logic we added to prompt.ts:
  
  const rawTools = await ToolRegistry.tools(model, agent);
  const tools = {};
  for (const item of rawTools) tools[item.id] = item;
  
  console.log("Before filter:", Object.keys(tools).length, "tools");
  
  if (input.agent.tools && input.agent.tools.length > 0) {
      const allowed = new Set(input.agent.tools)
      for (const id of Object.keys(tools)) {
        if (id !== "invalid" && !allowed.has(id)) {
          delete tools[id]
        }
      }
  }
  
  console.log("After filter:", Object.keys(tools));
}
run();
