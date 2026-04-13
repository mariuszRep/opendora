import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"

export const SkillSearchTool = Tool.define("skill_search", async (_initCtx) => {
  const description =
    "Search for skills across multiple registries (ClawHub, GitHub, Vercel, Anthropic). Use this to discover new skills that can extend the agent's capabilities."

  const parameters = z.object({
    query: z.string().describe("Search query for finding skills"),
    registries: z
      .array(z.enum(["clawhub", "github", "vercel", "anthropic"]))
      .optional()
      .describe("Specific registries to search (default: all)"),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skills = host(ctx).skills
      if (!skills?.search) {
        throw new Error("Skill search is not available in this context")
      }

      const results = await skills.search(params.query, params.registries)

      return {
        title: `Skill Search Results: "${params.query}"`,
        metadata: {
          count: results.length,
          query: params.query,
          registries: params.registries || ["all"],
        },
        output: [
          "<skill_search_results>",
          ...results.slice(0, 20).flatMap((skill) => [
            `  <skill>`,
            `    <name>${skill.name}</name>`,
            `    <description>${skill.description}</description>`,
            `    <source>${skill.source}</source>`,
            `    <registry>${skill.registry}</registry>`,
            `    <sourceType>${skill.sourceType}</sourceType>`,
            `  </skill>`,
          ]),
          "</skill_search_results>",
          "",
          `Found ${results.length} skill(s)${results.length > 20 ? " (showing first 20)" : ""}`,
          "",
          "To install a skill, use the skill_install tool with the source identifier.",
        ].join("\n"),
      }
    },
  }
})
