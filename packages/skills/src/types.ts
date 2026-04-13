import { z } from "zod"

export const SkillSourceType = z.enum([
  "clawhub",
  "github",
  "vercel",
  "anthropic",
  "local",
  "npm",
  "url",
])

export type SkillSourceType = z.infer<typeof SkillSourceType>

export const SkillMetadata = z.object({
  name: z.string(),
  version: z.string(),
  source: z.string(),
  sourceType: SkillSourceType,
  registry: z.string().optional(),
  installedAt: z.number(),
  computedHash: z.string(),
  dependencies: z.array(z.string()).optional(),
  location: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export type SkillMetadata = z.infer<typeof SkillMetadata>

export const SkillFrontmatter = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  permissions: z.enum(["allow", "deny", "ask"]).optional(),
  patterns: z.array(z.string()).optional(),
})

export type SkillFrontmatter = z.infer<typeof SkillFrontmatter>

export interface Skill {
  name: string
  description: string
  location: string
  content: string
  frontmatter: SkillFrontmatter
  metadata?: SkillMetadata
}

export interface SkillSearchResult {
  name: string
  description: string
  source: string
  sourceType: SkillSourceType
  registry: string
  version?: string
  tags?: string[]
  downloads?: number
  stars?: number
  verified?: boolean
}

export interface SkillBundle {
  name: string
  version: string
  files: Map<string, string>
  metadata: Partial<SkillMetadata>
}

export interface SecurityReport {
  safe: boolean
  warnings: string[]
  errors: string[]
  scannedAt: number
  scanner?: string
}

export interface RegistryInfo {
  name: string
  url?: string
  enabled: boolean
  lastSync?: number
}

export const SkillsLockFile = z.object({
  version: z.number(),
  registries: z.record(
    z.object({
      url: z.string().optional(),
      enabled: z.boolean(),
      lastSync: z.number().optional(),
    })
  ).optional(),
  skills: z.record(SkillMetadata),
})

export type SkillsLockFile = z.infer<typeof SkillsLockFile>

export interface InstallOptions {
  registry?: string
  version?: string
  force?: boolean
  skipVerify?: boolean
}

export interface SkillRegistry {
  name: string
  baseUrl?: string
  search(query: string): Promise<SkillSearchResult[]>
  fetch(identifier: string, version?: string): Promise<SkillBundle>
  verify?(bundle: SkillBundle): Promise<SecurityReport>
  list?(): Promise<SkillSearchResult[]>
}

export interface ISkillManager {
  search(query: string, registries?: string[]): Promise<SkillSearchResult[]>
  install(source: string, options?: InstallOptions): Promise<void>
  update(name: string): Promise<void>
  uninstall(name: string): Promise<void>
  list(): Promise<SkillMetadata[]>
  metadata(name: string): Promise<SkillMetadata | undefined>
  registries(): Promise<RegistryInfo[]>
}

export interface ISkillLoader {
  all(): Promise<Skill[]>
  get(name: string): Promise<Skill | undefined>
  reload(): Promise<void>
}
