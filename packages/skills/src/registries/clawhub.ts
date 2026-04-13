import type { SkillRegistry, SkillSearchResult, SkillBundle, SecurityReport } from "../types.ts"

export class ClawHubRegistry implements SkillRegistry {
  name = "clawhub"
  baseUrl = "https://clawhub.ai"

  async search(query: string): Promise<SkillSearchResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/skills/search?q=${encodeURIComponent(query)}`)
      if (!response.ok) {
        throw new Error(`ClawHub search failed: ${response.statusText}`)
      }
      const data = await response.json()
      return (data.skills || []).map((skill: any) => ({
        name: skill.name,
        description: skill.description || "",
        source: skill.id || skill.name,
        sourceType: "clawhub" as const,
        registry: this.name,
        version: skill.version,
        tags: skill.tags,
        downloads: skill.downloads,
        stars: skill.stars,
        verified: skill.verified,
      }))
    } catch (error) {
      console.error("ClawHub search error:", error)
      return []
    }
  }

  async fetch(identifier: string, version?: string): Promise<SkillBundle> {
    const versionParam = version ? `?version=${encodeURIComponent(version)}` : ""
    const response = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(identifier)}/download${versionParam}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch skill from ClawHub: ${response.statusText}`)
    }

    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    
    const files = await this.extractTarGz(arrayBuffer)
    
    const skillMd = files.get("SKILL.md")
    if (!skillMd) {
      throw new Error("Invalid skill bundle: missing SKILL.md")
    }

    return {
      name: identifier.split("/").pop() || identifier,
      version: version || "latest",
      files,
      metadata: {
        source: identifier,
        sourceType: "clawhub",
        registry: this.name,
      },
    }
  }

  async verify(bundle: SkillBundle): Promise<SecurityReport> {
    try {
      const response = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(bundle.metadata.source!)}/security`)
      if (!response.ok) {
        return {
          safe: false,
          warnings: ["Could not verify skill security"],
          errors: [],
          scannedAt: Date.now(),
        }
      }

      const data = await response.json()
      return {
        safe: data.safe !== false,
        warnings: data.warnings || [],
        errors: data.errors || [],
        scannedAt: Date.now(),
        scanner: "VirusTotal",
      }
    } catch (error) {
      return {
        safe: false,
        warnings: ["Security verification failed"],
        errors: [String(error)],
        scannedAt: Date.now(),
      }
    }
  }

  async list(): Promise<SkillSearchResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/skills`)
      if (!response.ok) {
        throw new Error(`ClawHub list failed: ${response.statusText}`)
      }
      const data = await response.json()
      return (data.skills || []).map((skill: any) => ({
        name: skill.name,
        description: skill.description || "",
        source: skill.id || skill.name,
        sourceType: "clawhub" as const,
        registry: this.name,
        version: skill.version,
        tags: skill.tags,
        downloads: skill.downloads,
        stars: skill.stars,
        verified: skill.verified,
      }))
    } catch (error) {
      console.error("ClawHub list error:", error)
      return []
    }
  }

  private async extractTarGz(buffer: ArrayBuffer): Promise<Map<string, string>> {
    const files = new Map<string, string>()
    
    try {
      const { default: tar } = await import("tar-stream")
      const { createGunzip } = await import("zlib")
      const { Readable } = await import("stream")
      
      const extract = tar.extract()
      
      await new Promise<void>((resolve, reject) => {
        extract.on("entry", (header: any, stream: any, next: any) => {
          const chunks: Buffer[] = []
          stream.on("data", (chunk: Buffer) => chunks.push(chunk))
          stream.on("end", () => {
            const content = Buffer.concat(chunks).toString("utf-8")
            files.set(header.name, content)
            next()
          })
          stream.resume()
        })
        
        extract.on("finish", resolve)
        extract.on("error", reject)
        
        const gunzip = createGunzip()
        const readable = Readable.from(Buffer.from(buffer))
        readable.pipe(gunzip).pipe(extract)
      })
    } catch (error) {
      throw new Error(`Failed to extract skill bundle: ${error}`)
    }
    
    return files
  }
}
