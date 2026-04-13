import fs from "fs/promises"
import path from "path"
import { parse as parseYaml } from "yaml"
import type { ISkillLoader, Skill, SkillFrontmatter, SkillMetadata, SkillsLockFile } from "./types.ts"

export class SkillLoader implements ISkillLoader {
  private skillDirs: string[]
  private lockFilePath: string
  private cache: Map<string, Skill> = new Map()
  private lastLoad: number = 0

  constructor(options: { skillDirs: string[]; lockFilePath: string }) {
    this.skillDirs = options.skillDirs
    this.lockFilePath = options.lockFilePath
  }

  async all(): Promise<Skill[]> {
    await this.ensureLoaded()
    return Array.from(this.cache.values())
  }

  async get(name: string): Promise<Skill | undefined> {
    await this.ensureLoaded()
    return this.cache.get(name)
  }

  async reload(): Promise<void> {
    this.cache.clear()
    this.lastLoad = 0
    await this.ensureLoaded()
  }

  private async ensureLoaded(): Promise<void> {
    const now = Date.now()
    if (now - this.lastLoad < 5000) {
      return
    }

    this.lastLoad = now
    await this.loadSkills()
  }

  private async loadSkills(): Promise<void> {
    const lockFile = await this.readLockFile()
    const discovered = new Map<string, Skill>()

    for (const dir of this.skillDirs) {
      try {
        await this.discoverSkills(dir, discovered, lockFile)
      } catch (error) {
        console.warn(`Failed to load skills from ${dir}:`, error)
      }
    }

    this.cache = discovered
  }

  private async discoverSkills(
    dir: string,
    discovered: Map<string, Skill>,
    lockFile: SkillsLockFile
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillDir = path.join(dir, entry.name)
        const skillMdPath = path.join(skillDir, "SKILL.md")

        try {
          const exists = await fs.access(skillMdPath).then(() => true).catch(() => false)
          if (!exists) continue

          const skill = await this.loadSkill(skillDir, skillMdPath, lockFile)
          if (skill && !discovered.has(skill.name)) {
            discovered.set(skill.name, skill)
          }
        } catch (error) {
          console.warn(`Failed to load skill from ${skillDir}:`, error)
        }
      }
    } catch (error) {
      if ((error as any).code !== "ENOENT") {
        throw error
      }
    }
  }

  private async loadSkill(
    skillDir: string,
    skillMdPath: string,
    lockFile: SkillsLockFile
  ): Promise<Skill | null> {
    const content = await fs.readFile(skillMdPath, "utf-8")
    const { frontmatter, body } = this.parseFrontmatter(content)

    if (!frontmatter.name) {
      return null
    }

    const metadata = lockFile.skills[frontmatter.name]

    return {
      name: frontmatter.name,
      description: frontmatter.description || "",
      location: skillDir,
      content: body,
      frontmatter,
      metadata,
    }
  }

  private parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    
    if (!match) {
      return {
        frontmatter: { name: "", description: "" },
        body: content,
      }
    }

    try {
      const frontmatter = parseYaml(match[1]) as SkillFrontmatter
      const body = match[2].trim()
      return { frontmatter, body }
    } catch (error) {
      console.warn("Failed to parse frontmatter:", error)
      return {
        frontmatter: { name: "", description: "" },
        body: content,
      }
    }
  }

  private async readLockFile(): Promise<SkillsLockFile> {
    try {
      const content = await fs.readFile(this.lockFilePath, "utf-8")
      return JSON.parse(content)
    } catch (error) {
      return {
        version: 2,
        registries: {},
        skills: {},
      }
    }
  }
}
