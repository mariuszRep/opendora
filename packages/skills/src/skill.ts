import z from "zod"
import path from "path"
import os from "os"
import fs from "fs/promises"
import { watch } from "chokidar"
import { Config } from "@projectflows/config/config"
import { Instance } from "@projectflows/runtime/instance"
import { NamedError } from "@projectflows/util/error"
import { ConfigMarkdown } from "@projectflows/config/markdown"
import { Log } from "@projectflows/util/log"
import { Global } from "@projectflows/util/global"
import { Filesystem } from "@projectflows/tools/filesystem/lib/primitives"
import { Flag } from "@projectflows/util/flag"
import { Bus } from "@projectflows/runtime/bus"
import { BusEvent } from "@projectflows/util/bus-event"
import { Session } from "@projectflows/session/session"
import { Discovery } from "./discovery"
import { Glob } from "@projectflows/util/glob"
import { State } from "@projectflows/runtime/state"
import { SkillFrontmatter } from "./types.ts"

export namespace Skill {
  const log = Log.create({ service: "skill" })

  export const JsonConfig = z.object({
    tools: z.array(z.string()).optional(),
  })
  export type JsonConfig = z.infer<typeof JsonConfig>

  export const Info = z.object({
    name: z.string(),
    description: z.string(),
    location: z.string(),
    content: z.string(),
    tools: z.array(z.string()).optional(),
    frontmatter: SkillFrontmatter.optional(),
  })
  export type Info = z.infer<typeof Info>

  export const InvalidError = NamedError.create(
    "SkillInvalidError",
    z.object({
      path: z.string(),
      message: z.string().optional(),
      issues: z.array(z.any()).optional(),
    }) as any,
  )

  export const NameMismatchError = NamedError.create(
    "SkillNameMismatchError",
    z.object({
      path: z.string(),
      expected: z.string(),
      actual: z.string(),
    }) as any,
  )

  // Agent Skills spec naming rules
  // https://agentskills.io/specification
  const SKILL_NAME_MAX_LENGTH = 64
  const SKILL_NAME_REGEX = /^[a-z0-9](-?[a-z0-9])*$/

  function validateSkillName(name: string, skillDir: string): { valid: boolean; warnings: string[] } {
    const warnings: string[] = []
    const parentName = path.basename(skillDir)

    if (name !== parentName) {
      warnings.push(`Skill name "${name}" does not match parent directory "${parentName}"`)
    }
    if (name.length > SKILL_NAME_MAX_LENGTH) {
      warnings.push(`Skill name "${name}" exceeds ${SKILL_NAME_MAX_LENGTH} characters`)
    }
    if (!SKILL_NAME_REGEX.test(name)) {
      warnings.push(`Skill name "${name}" contains invalid characters; expected lowercase alphanumeric and hyphens`)
    }

    return { valid: true, warnings }
  }

  // External skill directories to search for (project-level and global)
  // These follow the directory layout used by Claude Code and other agents.
  const EXTERNAL_DIRS = [".claude", ".agents"]
  const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
  const OPENDORA_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
  const SKILL_PATTERN = "**/SKILL.md"

  async function stateInit() {
    const skills: Record<string, Info> = {}
    const dirs = new Set<string>()

    const addSkill = async (match: string) => {
      const md = await ConfigMarkdown.parse(match).catch((err) => {
        const message = ConfigMarkdown.FrontmatterError.isInstance(err)
          ? err.data.message
          : `Failed to parse skill ${match}`
        Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        log.error("failed to load skill", { skill: match, err })
        return undefined
      })

      if (!md) return

      // Agent Skills spec: a description is essential for disclosure; skip without one.
      if (!md.data.description || typeof md.data.description !== "string" || md.data.description.trim() === "") {
        log.error("skipping skill without description", { skill: match })
        Bus.publish(Session.Event.Error, {
          error: new NamedError.Unknown({ message: `Skill ${match} is missing a description` }).toObject(),
        })
        return
      }

      const frontmatter = SkillFrontmatter.safeParse(md.data)
      if (!frontmatter.success) {
        log.warn("skill frontmatter validation failed", { skill: match, issues: frontmatter.error.issues })
      }

      const name = String(md.data.name ?? "")
      const description = String(md.data.description ?? "")
      const skillDir = path.dirname(match)

      const { warnings } = validateSkillName(name, skillDir)
      for (const warning of warnings) {
        log.warn("skill name warning", { skill: match, warning })
      }

      // Warn on duplicate skill names
      if (skills[name]) {
        log.warn("duplicate skill name", {
          name,
          existing: skills[name]!.location,
          duplicate: match,
        })
      }

      dirs.add(skillDir)

      // Read skill.json from same directory for tools and extra config
      const skillJsonPath = path.join(skillDir, "skill.json")
      let skillConfig: JsonConfig | undefined
      try {
        const raw = await fs.readFile(skillJsonPath, "utf-8")
        const result = JsonConfig.safeParse(JSON.parse(raw))
        if (result.success) skillConfig = result.data
      } catch {
        // skill.json is optional
      }

      skills[name] = {
        name,
        description,
        location: match,
        content: md.content,
        tools: skillConfig?.tools,
        frontmatter: frontmatter.success ? frontmatter.data : undefined,
      }
    }

    const scanExternal = async (root: string, scope: "global" | "project") => {
      return Glob.scan(EXTERNAL_SKILL_PATTERN, {
        cwd: root,
        absolute: true,
        include: "file",
        dot: true,
        symlink: true,
      })
        .then((matches) => Promise.all(matches.map(addSkill)))
        .catch((error) => {
          log.error(`failed to scan ${scope} skills`, { dir: root, error })
        })
    }

    // Scan external skill directories (.claude/skills/, .agents/skills/, etc.)
    // Load global (home) first, then project-level (so project-level overwrites)
    if (!Flag.PROJECTFLOWS_DISABLE_EXTERNAL_SKILLS) {
      for (const dir of EXTERNAL_DIRS) {
        const root = path.join(Global.Path.home, dir)
        if (!(await Filesystem.isDir(root))) continue
        await scanExternal(root, "global")
      }

      for await (const root of Filesystem.up({
        targets: EXTERNAL_DIRS,
        start: Instance.directory,
        stop: Instance.worktree,
      })) {
        await scanExternal(root, "project")
      }
    }

    // Scan .projectflows/skill/ directories
    for (const dir of await Config.directories()) {
      const matches = await Glob.scan(OPENDORA_SKILL_PATTERN, {
        cwd: dir,
        absolute: true,
        include: "file",
        symlink: true,
      })
      for (const match of matches) {
        await addSkill(match)
      }
    }

    // Scan additional skill paths from config
    const config = await Config.get()
    for (const skillPath of config.skills?.paths ?? []) {
      const expanded = skillPath.startsWith("~/") ? path.join(os.homedir(), skillPath.slice(2)) : skillPath
      const resolved = path.isAbsolute(expanded) ? expanded : path.join(Instance.directory, expanded)
      if (!(await Filesystem.isDir(resolved))) {
        log.warn("skill path not found", { path: resolved })
        continue
      }
      const matches = await Glob.scan(SKILL_PATTERN, {
        cwd: resolved,
        absolute: true,
        include: "file",
        symlink: true,
      })
      for (const match of matches) {
        await addSkill(match)
      }
    }

    // Download and load skills from URLs
    for (const url of config.skills?.urls ?? []) {
      const list = await Discovery.pull(url)
      for (const dir of list) {
        dirs.add(dir)
        const matches = await Glob.scan(SKILL_PATTERN, {
          cwd: dir,
          absolute: true,
          include: "file",
          symlink: true,
        })
        for (const match of matches) {
          await addSkill(match)
        }
      }
    }

    return {
      skills,
      dirs: Array.from(dirs),
    }
  }

  export const state = Instance.state(stateInit)

  export function reload() {
    State.reset(() => Instance.directory, stateInit)
  }

  let _watcher: ReturnType<typeof watch> | undefined

  export async function watchDirs() {
    if (_watcher) return
    const dirs = await Config.directories()
    const candidates = await Promise.all(
      dirs.map(async (d) => {
        const p = path.join(d, "skill")
        return await Filesystem.isDir(p) ? p : undefined
      }),
    )
    const skillDirs = candidates.filter((p): p is string => p !== undefined)
    if (skillDirs.length === 0) return
    _watcher = watch(skillDirs, { ignoreInitial: true, depth: 2 })
    const onChange = () => {
      reload()
      Bus.publish(BusEvent.SkillsUpdated, {}).catch(() => {})
    }
    _watcher.on("add", onChange).on("change", onChange).on("unlink", onChange).on("addDir", onChange).on("unlinkDir", onChange)
    log.info("watching skill directories", { dirs: skillDirs })
  }

  export async function get(name: string) {
    return state().then((x) => x.skills[name])
  }

  export async function all() {
    reload()
    return state().then((x) => Object.values(x.skills))
  }

  export async function dirs() {
    return state().then((x) => x.dirs)
  }

  export async function save(location: string, body: string) {
    // If the caller supplied frontmatter, write the content as-is (their frontmatter wins).
    // If not, preserve the existing frontmatter so the skill stays valid after reload.
    const hasFrontmatter = /^---[\s\S]*?---/.test(body)
    if (hasFrontmatter) {
      await fs.writeFile(location, body, "utf-8")
    } else {
      const existing = await fs.readFile(location, "utf-8").catch(() => "")
      const fmMatch = existing.match(/^(---[\s\S]*?---\r?\n?)/)
      const frontmatter = fmMatch ? fmMatch[1] : ""
      await fs.writeFile(location, frontmatter + body, "utf-8")
    }
    reload()
  }

  const ANTHROPIC_SKILLS_REPO = "anthropics/skills"
  const ANTHROPIC_SKILLS_PATH = "skills"
  const GITHUB_API = "https://api.github.com"
  const CLAWHUB_API = "https://clawhub.ai"

  /** Normalise a string for fuzzy matching: lowercase, collapse spaces/hyphens/underscores */
  function normalise(s: string) {
    return s.toLowerCase().replace(/[-_\s]+/g, " ").trim()
  }

  function matches(query: string, ...fields: string[]) {
    const q = normalise(query)
    // Match if every space-separated token appears in at least one field
    const tokens = q.split(" ").filter(Boolean)
    const haystack = fields.map(normalise).join(" ")
    return tokens.every((t) => haystack.includes(t))
  }

  /** Fetch the directory listing + SKILL.md descriptions for a GitHub-hosted skills repo */
  async function listGitHubSkills(
    owner: string,
    repo: string,
    skillsPath: string,
    sourceType: string,
  ): Promise<Array<{ name: string; description: string; source: string; sourceType: string; registry: string }>> {
    const headers = { Accept: "application/vnd.github+json" }
    const contentsUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${skillsPath}`
    const res = await fetch(contentsUrl, { headers })
    if (!res.ok) return []

    const entries = await res.json() as any[]
    const dirs = entries.filter((e: any) => e.type === "dir")

    // Fetch all SKILL.md files in parallel
    const results = await Promise.all(
      dirs.map(async (entry: any) => {
        let description = ""
        try {
          const mdUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${skillsPath}/${entry.name}/SKILL.md`
          const mdRes = await fetch(mdUrl, { headers })
          if (mdRes.ok) {
            const mdData = await mdRes.json() as any
            const content = Buffer.from(mdData.content.replace(/\n/g, ""), "base64").toString("utf-8")
            const m = content.match(/^description:\s*(.+)$/m)
            if (m) description = m[1]!.trim().replace(/^['"]|['"]$/g, "")
          }
        } catch {}
        return {
          name: entry.name,
          description,
          source: `${skillsPath}/${entry.name}`,
          sourceType,
          registry: sourceType,
        }
      }),
    )
    return results
  }

  export async function search(query: string, registries?: string[]): Promise<Array<{ name: string; description: string; source: string; sourceType: string; registry: string }>> {
    // Default to all registries when none specified
    const targets = registries ?? ["anthropic", "vercel", "clawhub", "github"]
    const results: Array<{ name: string; description: string; source: string; sourceType: string; registry: string }> = []

    for (const registry of targets) {
      try {
        if (registry === "clawhub") {
          const url = `${CLAWHUB_API}/api/skills/search?q=${encodeURIComponent(query)}`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json() as any
            for (const skill of data.skills ?? []) {
              results.push({
                name: skill.name,
                description: skill.description ?? "",
                source: skill.id ?? skill.name,
                sourceType: "clawhub",
                registry: "clawhub",
              })
            }
          }
        } else if (registry === "anthropic") {
          const all = await listGitHubSkills("anthropics", "skills", ANTHROPIC_SKILLS_PATH, "anthropic")
          for (const skill of all) {
            if (matches(query, skill.name, skill.description)) results.push(skill)
          }
        } else if (registry === "vercel") {
          const all = await listGitHubSkills("vercel", "agent-resources", "skills", "vercel")
          for (const skill of all) {
            if (matches(query, skill.name, skill.description)) results.push(skill)
          }
        } else if (registry === "github") {
          const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query + " topic:opendora-skill")}&per_page=10`
          const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } })
          if (res.ok) {
            const data = await res.json() as any
            for (const repo of data.items ?? []) {
              results.push({
                name: repo.name,
                description: repo.description ?? "",
                source: repo.full_name,
                sourceType: "github",
                registry: "github",
              })
            }
          }
        }
      } catch (err) {
        log.error("skill registry search failed", { registry, query, err })
      }
    }

    return results
  }

  // Registry configs for GitHub-hosted skill repos
  const GITHUB_REGISTRIES: Record<string, { owner: string; repo: string; ref: string; skillsDir: string }> = {
    anthropic: { owner: "anthropics", repo: "skills",         ref: "main", skillsDir: "skills" },
    vercel:    { owner: "vercel",     repo: "agent-resources", ref: "main", skillsDir: "skills" },
  }

  /** Use GitHub tree API to fetch all files under a directory in a repo */
  async function fetchGitHubDir(
    owner: string,
    repo: string,
    dirPath: string,
    ref = "main",
  ): Promise<Map<string, string>> {
    const GITHUB_API = "https://api.github.com"
    const headers = { Accept: "application/vnd.github+json" }

    // Get the full recursive tree
    const treeRes = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
      { headers },
    )
    if (!treeRes.ok) {
      throw new Error(`GitHub tree API failed for ${owner}/${repo}@${ref}: ${treeRes.status} ${treeRes.statusText}`)
    }
    const tree = await treeRes.json() as { tree: Array<{ path: string; type: string; url: string; size?: number }> }

    const prefix = dirPath === "" ? "" : (dirPath.endsWith("/") ? dirPath : `${dirPath}/`)
    const fileEntries = tree.tree.filter(
      (e) => e.type === "blob" && (prefix === "" || e.path.startsWith(prefix)),
    )

    if (fileEntries.length === 0) {
      throw new Error(`No files found at path "${dirPath || "/"}" in ${owner}/${repo}@${ref}`)
    }

    const files = new Map<string, string>()
    await Promise.all(
      fileEntries.map(async (entry) => {
        const blobRes = await fetch(entry.url, { headers })
        if (!blobRes.ok) return
        const blob = await blobRes.json() as { content: string; encoding: string }
        const content = blob.encoding === "base64"
          ? Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf-8")
          : blob.content
        // Store relative to the skill dir (strip the leading dirPath/)
        files.set(entry.path.slice(prefix.length), content)
      }),
    )
    return files
  }

  /** List immediate subdirectories under a GitHub repo path */
  async function listGitHubSubdirs(
    owner: string,
    repo: string,
    dirPath: string,
    ref = "main",
  ): Promise<string[]> {
    const headers = { Accept: "application/vnd.github+json" }
    const contentsUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${dirPath}?ref=${ref}`
    const res = await fetch(contentsUrl, { headers })
    if (!res.ok) {
      throw new Error(`GitHub list failed for ${owner}/${repo}/${dirPath}@${ref}: ${res.status} ${res.statusText}`)
    }
    const entries = (await res.json()) as Array<{ type: string; name: string }>
    return entries.filter((e) => e.type === "dir").map((e) => e.name)
  }

  export async function install(source: string, options?: { registry?: string; version?: string }) {
    let registry = options?.registry
    let skillPath = source

    if (source.includes(":")) {
      const colonIdx = source.indexOf(":")
      registry = source.slice(0, colonIdx)
      skillPath = source.slice(colonIdx + 1)
    }

    const dirs = await Config.directories()
    const installBase = dirs.length > 0
      ? path.join(dirs[0]!, "skill")
      : path.join(Instance.directory, ".projectflows", "skill")

    // GitHub-hosted registries (anthropic, vercel)
    const ghReg = registry ? GITHUB_REGISTRIES[registry] : undefined
    if (ghReg) {
      const ref = options?.version ?? ghReg.ref
      const fullPath = skillPath.startsWith(ghReg.skillsDir + "/")
        ? skillPath
        : `${ghReg.skillsDir}/${skillPath}`
      const skillName = fullPath.split("/").pop()!

      log.info("fetching skill from github registry", { registry, owner: ghReg.owner, repo: ghReg.repo, fullPath, ref })
      const files = await fetchGitHubDir(ghReg.owner, ghReg.repo, fullPath, ref)

      const skillDir = path.join(installBase, skillName)
      await fs.mkdir(skillDir, { recursive: true })
      for (const [filename, content] of files) {
        const dest = path.join(skillDir, filename)
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await fs.writeFile(dest, content, "utf-8")
      }
      log.info("installed skill", { skillName, files: files.size, skillDir })
      reload()
      return
    }

    // Generic GitHub repo: github:owner/repo or github:owner/repo/path
    if (registry === "github") {
      const parts = skillPath.split("/")
      if (parts.length < 2) throw new Error(`GitHub source must be "owner/repo" or "owner/repo/path", got: ${skillPath}`)
      const owner = parts[0]!
      const repo = parts[1]!
      const subPath = parts.slice(2).join("/")
      const ref = options?.version ?? "main"
      const skillName = subPath ? subPath.split("/").pop()! : repo

      log.info("fetching skill from github", { owner, repo, subPath, ref })
      const files = subPath
        ? await fetchGitHubDir(owner, repo, subPath, ref)
        : await fetchGitHubDir(owner, repo, "", ref)

      const skillDir = path.join(installBase, skillName)
      await fs.mkdir(skillDir, { recursive: true })
      for (const [filename, content] of files) {
        const dest = path.join(skillDir, filename)
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await fs.writeFile(dest, content, "utf-8")
      }
      log.info("installed skill from github", { skillName, files: files.size, skillDir })
      reload()
      return
    }

    // Agent Skills monorepo registry: agentskills:owner/repo or agentskills:owner/repo/skill-name
    // These repos have a top-level skills/ directory containing individual skill folders.
    if (registry === "agentskills") {
      const parts = skillPath.split("/")
      if (parts.length < 2) throw new Error(`Agent Skills source must be "owner/repo" or "owner/repo/skill-name", got: ${skillPath}`)
      const owner = parts[0]!
      const repo = parts[1]!
      const skillName = parts.slice(2).join("/")
      const ref = options?.version ?? "main"
      const skillsDir = "skills"

      if (skillName) {
        const fullPath = `${skillsDir}/${skillName}`
        log.info("fetching skill from agentskills repo", { owner, repo, skillName, ref })
        const files = await fetchGitHubDir(owner, repo, fullPath, ref)
        const skillDir = path.join(installBase, skillName)
        await fs.mkdir(skillDir, { recursive: true })
        for (const [filename, content] of files) {
          const dest = path.join(skillDir, filename)
          await fs.mkdir(path.dirname(dest), { recursive: true })
          await fs.writeFile(dest, content, "utf-8")
        }
        log.info("installed skill from agentskills repo", { skillName, files: files.size, skillDir })
      } else {
        log.info("fetching all skills from agentskills repo", { owner, repo, ref })
        const subdirs = await listGitHubSubdirs(owner, repo, skillsDir, ref)
        if (subdirs.length === 0) {
          throw new Error(`No skills found in "skills/" directory of ${owner}/${repo}@${ref}`)
        }
        for (const subdir of subdirs) {
          const fullPath = `${skillsDir}/${subdir}`
          const files = await fetchGitHubDir(owner, repo, fullPath, ref)
          const skillDir = path.join(installBase, subdir)
          await fs.mkdir(skillDir, { recursive: true })
          for (const [filename, content] of files) {
            const dest = path.join(skillDir, filename)
            await fs.mkdir(path.dirname(dest), { recursive: true })
            await fs.writeFile(dest, content, "utf-8")
          }
          log.info("installed skill from agentskills repo", { skillName: subdir, files: files.size, skillDir })
        }
      }

      reload()
      return
    }

    // ClawHub registry
    if (registry === "clawhub" || (!registry && !skillPath.includes("/"))) {
      const CLAWHUB_API = "https://clawhub.ai"
      const downloadUrl = `${CLAWHUB_API}/api/skills/${encodeURIComponent(skillPath)}/download`
      const res = await fetch(downloadUrl)
      if (!res.ok) {
        throw new Error(`ClawHub download failed for "${skillPath}": ${res.status} ${res.statusText}`)
      }
      const contentType = res.headers.get("content-type") ?? ""
      const skillName = skillPath.split("/").pop()!
      const skillDir = path.join(installBase, skillName)
      await fs.mkdir(skillDir, { recursive: true })

      if (contentType.includes("application/json")) {
        const data = await res.json() as { files?: Record<string, string>; content?: string }
        if (data.files) {
          for (const [filename, content] of Object.entries(data.files)) {
            const dest = path.join(skillDir, filename)
            await fs.mkdir(path.dirname(dest), { recursive: true })
            await fs.writeFile(dest, content, "utf-8")
          }
        } else if (data.content) {
          await fs.writeFile(path.join(skillDir, "SKILL.md"), data.content, "utf-8")
        }
      } else {
        const content = await res.text()
        await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8")
      }
      log.info("installed skill from clawhub", { skillName, skillDir })
      reload()
      return
    }

    throw new Error(
      `Unknown install source: "${source}"\n` +
      `Supported formats:\n` +
      `  anthropic:skills/skill-creator   (Anthropic GitHub skills repo)\n` +
      `  vercel:skills/nextjs             (Vercel agent-resources repo)\n` +
      `  github:owner/repo                (any GitHub repo)\n` +
      `  github:owner/repo/path           (sub-path in a GitHub repo)\n` +
      `  agentskills:owner/repo           (Agent Skills monorepo, installs all skills/)\n` +
      `  agentskills:owner/repo/skill-name (Agent Skills monorepo, installs one skill)\n` +
      `  clawhub:skill-name               (ClawHub registry)`,
    )
  }

  export async function list() {
    return all()
  }

/** Create a new local skill under the first .projectflows/skill/ directory */
  export async function create(params: {
    name: string
    description: string
    tools?: string[]
    content?: string
  }): Promise<{ dir: string }> {
    const dirs = await Config.directories()
    const installBase = dirs.length > 0
      ? path.join(dirs[0]!, "skill")
      : path.join(Instance.directory, ".projectflows", "skill")

    const skillDir = path.join(installBase, params.name)
    await fs.mkdir(skillDir, { recursive: true })

    const safeDesc = params.description.includes(":") || params.description.includes('"')
      ? `"${params.description.replace(/"/g, '\\"')}"`
      : params.description
    const fmLines: string[] = [
      `name: ${params.name}`,
      `description: ${safeDesc}`,
    ]

    const skillMd = `---\n${fmLines.join("\n")}\n---\n\n${params.content ?? ""}`
    await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMd, "utf-8")

    if (params.tools && params.tools.length > 0) {
      const config: JsonConfig = { tools: params.tools }
      await fs.writeFile(path.join(skillDir, "skill.json"), JSON.stringify(config, null, 2), "utf-8")
    }

    reload()
    return { dir: skillDir }
  }

  /** Write or update the skill.json config for a skill */
  export async function saveConfig(name: string, patch: Partial<JsonConfig>): Promise<void> {
    const skill = await get(name)
    if (!skill) throw new Error(`Skill "${name}" not found`)
    const skillDir = path.dirname(skill.location)
    const skillJsonPath = path.join(skillDir, "skill.json")

    let existing: JsonConfig = {}
    try {
      const raw = await fs.readFile(skillJsonPath, "utf-8")
      const result = JsonConfig.safeParse(JSON.parse(raw))
      if (result.success) existing = result.data
    } catch {
      // start fresh
    }

    const updated: JsonConfig = { ...existing, ...patch }
    await fs.writeFile(skillJsonPath, JSON.stringify(updated, null, 2), "utf-8")
    reload()
  }

  /** Remove a local skill by name */
  export async function remove(name: string): Promise<void> {
    const skill = await get(name)
    if (!skill) throw new Error(`Skill "${name}" not found`)
    const dir = path.dirname(skill.location)
    await fs.rm(dir, { recursive: true, force: true })
    reload()
  }
}
