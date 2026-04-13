import type { SkillRegistry, SkillSearchResult, SkillBundle } from "../types.ts"

export class GitHubRegistry implements SkillRegistry {
  name = "github"
  baseUrl = "https://api.github.com"

  async search(query: string): Promise<SkillSearchResult[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/search/repositories?q=${encodeURIComponent(query)}+topic:agent-skills+OR+topic:openclaw-skills+OR+topic:claude-skills`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
          },
        }
      )
      
      if (!response.ok) {
        throw new Error(`GitHub search failed: ${response.statusText}`)
      }
      
      const data = await response.json() as { items?: any[] }
      return (data.items || []).map((repo: any) => ({
        name: repo.name,
        description: repo.description || "",
        source: repo.full_name,
        sourceType: "github" as const,
        registry: this.name,
        tags: repo.topics || [],
        stars: repo.stargazers_count,
      }))
    } catch (error) {
      console.error("GitHub search error:", error)
      return []
    }
  }

  async fetch(identifier: string, version?: string): Promise<SkillBundle> {
    const [owner, repo] = identifier.split("/")
    if (!owner || !repo) {
      throw new Error(`Invalid GitHub identifier: ${identifier}. Expected format: owner/repo`)
    }

    const ref = version || "main"
    const skillPath = "SKILL.md"
    
    const response = await fetch(
      `${this.baseUrl}/repos/${owner}/${repo}/contents/${skillPath}?ref=${ref}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      }
    )

    if (!response.ok) {
      const altResponse = await fetch(
        `${this.baseUrl}/repos/${owner}/${repo}/contents/${skillPath}?ref=master`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
          },
        }
      )
      
      if (!altResponse.ok) {
        throw new Error(`Failed to fetch SKILL.md from GitHub: ${response.statusText}`)
      }
      
      return this.parseGitHubContent(altResponse, identifier, "master")
    }

    return this.parseGitHubContent(response, identifier, ref)
  }

  private async parseGitHubContent(response: Response, identifier: string, ref: string): Promise<SkillBundle> {
    const data = await response.json() as { type: string; content: string }
    
    if (data.type !== "file") {
      throw new Error("SKILL.md is not a file")
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8")
    const files = new Map<string, string>()
    files.set("SKILL.md", content)

    const [owner, repo] = identifier.split("/")
    if (!owner || !repo) {
      throw new Error(`Invalid identifier: ${identifier}`)
    }
    await this.fetchAdditionalFiles(owner, repo, ref, files)

    return {
      name: repo,
      version: ref,
      files,
      metadata: {
        source: identifier,
        sourceType: "github",
        registry: this.name,
      },
    }
  }

  private async fetchAdditionalFiles(
    owner: string,
    repo: string,
    ref: string,
    files: Map<string, string>
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${owner}/${repo}/contents?ref=${ref}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
          },
        }
      )

      if (!response.ok) return

      const contents = await response.json() as Array<{ type: string; name: string; download_url: string }>
      const additionalFiles = contents.filter(
        (item: any) =>
          item.type === "file" &&
          item.name !== "SKILL.md" &&
          (item.name.endsWith(".md") || item.name.endsWith(".sh") || item.name.endsWith(".json"))
      )

      for (const file of additionalFiles.slice(0, 10)) {
        try {
          const fileResponse = await fetch(file.download_url)
          if (fileResponse.ok) {
            const content = await fileResponse.text()
            files.set(file.name, content)
          }
        } catch (error) {
          console.warn(`Failed to fetch ${file.name}:`, error)
        }
      }
    } catch (error) {
      console.warn("Failed to fetch additional files:", error)
    }
  }
}
