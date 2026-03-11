import { z } from "zod";
export const Config = z.object({
    name: z.string(),
    tools: z.array(z.string()).optional(),
})
const existing = { name: "build", tools: ["bash", "read"] };
const patch = { tools: ["question"] };
const next = Config.parse({ ...existing, ...patch });
console.log(next);
