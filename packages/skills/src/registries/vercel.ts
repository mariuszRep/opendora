import type { SkillRegistry, SkillSearchResult, SkillBundle } from "../types.ts"

export class VercelRegistry implements SkillRegistry {
  name = "vercel"
  baseUrl = "https://raw.githubusercontent.com/vercel/agent-resources/main/skills"

  async search(query: string): Promise<SkillSearchResult[]> {
    try {
      const indexUrl = `${this.baseUrl}/index.json`
      const response = await fetch(indexUrl)
      
      if (!response.ok) {
        return []
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
          sourceType: "vercel" as const,
          registry: this.name,
          version: skill.version || "latest",
          tags: skill.tags || [],
        }))
    } catch (error) {
      console.error("Vercel search error:", error)
      return []
    }
  }

  async fetch(identifier: string, version?: string): Promise<SkillBundle> {
    const skillUrl = identifier.startsWith("http")
      ? identifier
      : `${this.baseUrl}/${identifier}/SKILL.md`

    const response = await fetch(skillUrl)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch skill from Vercel: ${response.statusText}`)
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
        sourceType: "vercel",
        registry: this.name,
      },
    }
  }

  async list(): Promise<SkillSearchResult[]> {
    try {
      const indexUrl = `${this.baseUrl}/index.json`
      const response = await fetch(indexUrl)
      
      if (!response.ok) {
        return []
      }

      const index = await response.json() as { skills: any[] }
      
      return (index.skills || []).map((skill: any) => ({
        name: skill.name,
        description: skill.description || "",
        source: skill.path || skill.name,
        sourceType: "vercel" as const,
        registry: this.name,
        version: skill.version || "latest",
        tags: skill.tags || [],
      }))
    } catch (error) {
      console.error("Vercel list error:", error)
      return []
    }
  }

  private async fetchAdditionalFiles(basePath: string, files: Map<string, string>): Promise<void> {
    const commonFiles = ["README.md", "example.md", "config.json"]
    
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
