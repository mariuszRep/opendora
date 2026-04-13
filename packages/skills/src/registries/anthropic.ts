import type { SkillRegistry, SkillSearchResult, SkillBundle } from "../types.ts"

export class AnthropicRegistry implements SkillRegistry {
  name = "anthropic"
  baseUrl = "https://raw.githubusercontent.com/anthropics/skills/main"

  async search(query: string): Promise<SkillSearchResult[]> {
    try {
      const indexUrl = `${this.baseUrl}/index.json`
      const response = await fetch(indexUrl)
      
      if (!response.ok) {
        return this.fallbackSearch(query)
      }

      const index = await response.json() as { skills: any[] }
      const lowerQuery = query.toLowerCase()
      
      return (index.skills || [])
        .filter((skill: any) => 
          skill.name?.toLowerCase().includes(lowerQuery) ||
          skill.description?.toLowerCase().includes(lowerQuery) ||
          skill.tags?.some((tag: string) => tag.toLowerCase().includes(lowerQuery))
        )
        .map((skill: any) => ({
          name: skill.name,
          description: skill.description || "",
          source: skill.path || skill.name,
          sourceType: "anthropic" as const,
          registry: this.name,
          version: skill.version || "latest",
          tags: skill.tags || [],
        }))
    } catch (error) {
      console.error("Anthropic search error:", error)
      return this.fallbackSearch(query)
    }
  }

  private async fallbackSearch(query: string): Promise<SkillSearchResult[]> {
    const knownSkills = [
      { name: "react", path: "react" },
      { name: "nextjs", path: "nextjs" },
      { name: "typescript", path: "typescript" },
      { name: "python", path: "python" },
    ]

    const lowerQuery = query.toLowerCase()
    return knownSkills
      .filter(skill => skill.name.toLowerCase().includes(lowerQuery))
      .map(skill => ({
        name: skill.name,
        description: `Anthropic ${skill.name} skill`,
        source: skill.path,
        sourceType: "anthropic" as const,
        registry: this.name,
      }))
  }

  async fetch(identifier: string, version?: string): Promise<SkillBundle> {
    const skillUrl = identifier.startsWith("http")
      ? identifier
      : `${this.baseUrl}/${identifier}/SKILL.md`

    const response = await fetch(skillUrl)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch skill from Anthropic: ${response.statusText}`)
    }

    const content = await response.text()
    const files = new Map<string, string>()
    files.set("SKILL.md", content)

    const basePath = skillUrl.substring(0, skillUrl.lastIndexOf("/"))
    await this.fetchAdditionalFiles(basePath, files)

    return {
      name: identifier.split("/").pop() || identifier,
      version: version || "latest",
      files,
      metadata: {
        source: identifier,
        sourceType: "anthropic",
        registry: this.name,
      },
    }
  }

  async list(): Promise<SkillSearchResult[]> {
    try {
      const indexUrl = `${this.baseUrl}/index.json`
      const response = await fetch(indexUrl)
      
      if (!response.ok) {
        return this.fallbackSearch("")
      }

      const index = await response.json() as { skills: any[] }
      
      return (index.skills || []).map((skill: any) => ({
        name: skill.name,
        description: skill.description || "",
        source: skill.path || skill.name,
        sourceType: "anthropic" as const,
        registry: this.name,
        version: skill.version || "latest",
        tags: skill.tags || [],
      }))
    } catch (error) {
      console.error("Anthropic list error:", error)
      return this.fallbackSearch("")
    }
  }

  private async fetchAdditionalFiles(basePath: string, files: Map<string, string>): Promise<void> {
    const commonFiles = ["README.md", "examples.md", "metadata.json"]
    
    for (const fileName of commonFiles) {
      try {
        const fileUrl = `${basePath}/${fileName}`
        const response = await fetch(fileUrl)
        
        if (response.ok) {
          const content = await response.text()
          files.set(fileName, content)
        }
      } catch (error) {
        // Ignore missing files
      }
    }
  }
}
