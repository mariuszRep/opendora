import fs from "fs/promises"
import path from "path"
import crypto from "crypto"
import type {
  ISkillManager,
  SkillRegistry,
  SkillSearchResult,
  SkillMetadata,
  InstallOptions,
  RegistryInfo,
  SkillsLockFile,
  SkillBundle,
} from "./types.ts"
import { ClawHubRegistry } from "./registries/clawhub.ts"
import { GitHubRegistry } from "./registries/github.ts"
import { VercelRegistry } from "./registries/vercel.ts"
import { AnthropicRegistry } from "./registries/anthropic.ts"

export class SkillManager implements ISkillManager {
  private _registries: Map<string, SkillRegistry> = new Map()
  private lockFilePath: string
  private skillsDir: string

  constructor(options: { lockFilePath: string; skillsDir: string }) {
    this.lockFilePath = options.lockFilePath
    this.skillsDir = options.skillsDir

    this._registries.set("clawhub", new ClawHubRegistry())
    this._registries.set("github", new GitHubRegistry())
    this._registries.set("vercel", new VercelRegistry())
    this._registries.set("anthropic", new AnthropicRegistry())
  }

  async search(query: string, registries?: string[]): Promise<SkillSearchResult[]> {
    const targetRegistries = registries
      ? Array.from(this._registries.entries()).filter(([name]) => registries.includes(name))
      : Array.from(this._registries.entries())

    const results = await Promise.all(
      targetRegistries.map(async ([_, registry]) => {
        try {
          return await registry.search(query)
        } catch (error) {
          console.error(`Search failed for ${registry.name}:`, error)
          return []
        }
      })
    )

    return results.flat()
  }

  async install(source: string, options: InstallOptions = {}): Promise<void> {
    const registry = this.detectRegistry(source, options.registry)
    if (!registry) {
      throw new Error(`Could not determine registry for source: ${source}`)
    }

    const bundle = await registry.fetch(source, options.version)

    if (!options.skipVerify && registry.verify) {
      const report = await registry.verify(bundle)
      if (!report.safe) {
        throw new Error(
          `Security verification failed:\n${report.errors.join("\n")}\n${report.warnings.join("\n")}`
        )
      }
      if (report.warnings.length > 0) {
        console.warn(`Security warnings for ${bundle.name}:`, report.warnings)
      }
    }

    const skillDir = path.join(this.skillsDir, bundle.name)
    await fs.mkdir(skillDir, { recursive: true })

    for (const [filename, content] of bundle.files.entries()) {
      const filePath = path.join(skillDir, filename)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, content, "utf-8")
    }

    const hash = this.computeHash(bundle)
    const metadata: SkillMetadata = {
      name: bundle.name,
      version: bundle.version,
      source: bundle.metadata.source || source,
      sourceType: bundle.metadata.sourceType || registry.name as any,
      registry: bundle.metadata.registry || registry.name,
      installedAt: Date.now(),
      computedHash: hash,
      location: skillDir,
      dependencies: bundle.metadata.dependencies,
    }

    await this.updateLockFile(metadata)
  }

  async update(name: string): Promise<void> {
    const lockFile = await this.readLockFile()
    const existing = lockFile.skills[name]

    if (!existing) {
      throw new Error(`Skill "${name}" is not installed`)
    }

    await this.install(existing.source, {
      registry: existing.registry,
      version: "latest",
      force: true,
    })
  }

  async uninstall(name: string): Promise<void> {
    const lockFile = await this.readLockFile()
    const existing = lockFile.skills[name]

    if (!existing) {
      throw new Error(`Skill "${name}" is not installed`)
    }

    try {
      await fs.rm(existing.location, { recursive: true, force: true })
    } catch (error) {
      console.warn(`Failed to remove skill directory: ${error}`)
    }

    delete lockFile.skills[name]
    await this.writeLockFile(lockFile)
  }

  async list(): Promise<SkillMetadata[]> {
    const lockFile = await this.readLockFile()
    return Object.values(lockFile.skills)
  }

  async metadata(name: string): Promise<SkillMetadata | undefined> {
    const lockFile = await this.readLockFile()
    return lockFile.skills[name]
  }

  async registries(): Promise<RegistryInfo[]> {
    const lockFile = await this.readLockFile()
    const registryConfigs = lockFile.registries || {}

    return Array.from(this._registries.keys()).map((name) => ({
      name,
      url: this._registries.get(name)?.baseUrl,
      enabled: registryConfigs[name]?.enabled ?? true,
      lastSync: registryConfigs[name]?.lastSync,
    }))
  }

  private detectRegistry(source: string, hint?: string): SkillRegistry | undefined {
    if (hint && this._registries.has(hint)) {
      return this._registries.get(hint)
    }

    if (source.includes("clawhub.ai") || source.includes("clawhub:")) {
      return this._registries.get("clawhub")
    }

    if (source.includes("github.com") || source.includes("/")) {
      return this._registries.get("github")
    }

    if (source.includes("vercel.com") || source.includes("vercel:")) {
      return this._registries.get("vercel")
    }

    if (source.includes("anthropic") || source.includes("anthropics")) {
      return this._registries.get("anthropic")
    }

    return this._registries.get("clawhub")
  }

  private computeHash(bundle: SkillBundle): string {
    const hash = crypto.createHash("sha256")
    const sortedFiles = Array.from(bundle.files.entries()).sort(([a], [b]) => a.localeCompare(b))

    for (const [filename, content] of sortedFiles) {
      hash.update(filename)
      hash.update(content)
    }

    return hash.digest("hex")
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

  private async writeLockFile(lockFile: SkillsLockFile): Promise<void> {
    await fs.mkdir(path.dirname(this.lockFilePath), { recursive: true })
    await fs.writeFile(this.lockFilePath, JSON.stringify(lockFile, null, 2), "utf-8")
  }

  private async updateLockFile(metadata: SkillMetadata): Promise<void> {
    const lockFile = await this.readLockFile()
    lockFile.skills[metadata.name] = metadata
    await this.writeLockFile(lockFile)
  }
}
