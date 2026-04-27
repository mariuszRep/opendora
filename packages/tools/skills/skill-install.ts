import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import toolDef from "./skill-install.json"

export const SkillInstallTool = Tool.define("skill_install", async (_initCtx) => {
  const description = toolDef.description

  const parameters = z.object({
    source: z.string().describe("Source identifier (e.g., 'openclaw/filesystem', 'shadcn/ui', 'vercel:nextjs')"),
    registry: z
      .enum(["clawhub", "github", "vercel", "anthropic"])
      .optional()
      .describe("Registry to install from (auto-detected if not specified)"),
    version: z.string().optional().describe("Specific version to install (default: latest)"),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const skills = host(ctx).skills
      if (!skills?.install) {
        throw new Error("Skill installation is not available in this context")
      }

      await ctx.ask({
        permission: "skill_install",
        patterns: [params.source],
        always: [],
        metadata: { source: params.source, registry: params.registry, version: params.version },
      })

      await skills.install(params.source, {
        registry: params.registry,
        version: params.version,
      })

      return {
        title: `Installed skill: ${params.source}`,
        metadata: {
          source: params.source,
          version: params.version || "latest",
          registry: params.registry || "auto-detected",
        },
        output: [
          `Successfully installed skill from ${params.source}`,
          params.version ? `Version: ${params.version}` : "Version: latest",
          params.registry ? `Registry: ${params.registry}` : "Registry: auto-detected",
          "",
          "The skill is now available. Use skill_list to see all available skills.",
        ].join("\n"),
      }
    },
  }
})
