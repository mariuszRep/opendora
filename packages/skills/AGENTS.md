# AGENTS.md — @projectflows/skills

Multi-hub skill management for Projectflows.

## Package location

```
packages/skills/src/
  index.ts              — public exports
  types.ts              — all domain types, Zod schemas
  manager.ts            — SkillManager class (install/update/search)
  loader.ts             — SkillLoader class (discovery/loading)
  registries/
    clawhub.ts          — ClawHub registry adapter
    github.ts           — GitHub registry adapter
    vercel.ts           — Vercel registry adapter
    anthropic.ts        — Anthropic registry adapter
```

## Key rules

- **Skills are self-contained** — each skill is a directory with `SKILL.md` + optional supporting files
- **Agent Skills compatible** — supports the agentskills.io SKILL.md format, including `scripts/`, `references/`, and `assets/` directories
- **Multi-hub support** — ClawHub, GitHub, Vercel, Anthropic, and Agent Skills monorepo registries
- **Precedence order** — Workspace → User → Bundled (first match wins)
- **Lock file is source of truth** — `skills-lock.json` tracks installed skills
- **Registry auto-detection** — source format determines registry (e.g., `owner/repo` → GitHub)
- **Security first** — ClawHub skills verified via VirusTotal before install

## Core types

```ts
// Skill metadata (stored in lock file)
type SkillMetadata = {
  name: string
  version: string
  source: string              // e.g., "openclaw/filesystem", "shadcn/ui"
  sourceType: SkillSourceType // "clawhub" | "github" | "vercel" | "anthropic" | "local"
  registry: string            // registry name
  installedAt: number         // timestamp
  computedHash: string        // SHA-256 of skill content
  dependencies?: string[]     // other skills this depends on
  location: string            // filesystem path
}

// Skill (loaded from SKILL.md)
type Skill = {
  name: string
  description: string
  location: string
  content: string             // markdown body
  frontmatter: SkillFrontmatter
  metadata?: SkillMetadata
}

// Skill frontmatter (YAML at top of SKILL.md)
type SkillFrontmatter = {
  name: string
  description?: string
  version?: string
  tags?: string[]
  dependencies?: string[]
  permissions?: "allow" | "deny" | "ask"
  patterns?: string[]
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  "allowed-tools"?: string
  "disable-model-invocation"?: boolean
}
```

## Skills lock file

```json
{
  "version": 2,
  "registries": {
    "clawhub": {
      "url": "https://clawhub.ai",
      "enabled": true,
      "lastSync": 1744617600000
    },
    "github": { "enabled": true },
    "vercel": { "enabled": false },
    "anthropic": { "enabled": true }
  },
  "skills": {
    "filesystem": {
      "name": "filesystem",
      "version": "1.0.2",
      "source": "openclaw/filesystem",
      "sourceType": "clawhub",
      "registry": "clawhub",
      "installedAt": 1744617600000,
      "computedHash": "abc123...",
      "location": ".projectflows/skill/filesystem"
    }
  }
}
```

## Registry adapters

Each registry implements:

```ts
interface SkillRegistry {
  name: string
  baseUrl?: string
  search(query: string): Promise<SkillSearchResult[]>
  fetch(identifier: string, version?: string): Promise<SkillBundle>
  verify?(bundle: SkillBundle): Promise<SecurityReport>
  list?(): Promise<SkillSearchResult[]>
}
```

**ClawHub** (`clawhub.ts`)
- API: `https://clawhub.ai/api/skills`
- Security: VirusTotal scanning
- Format: tar.gz bundles
- 5200+ skills

**GitHub** (`github.ts`)
- API: GitHub REST API v3
- Search: repos with `agent-skills`, `openclaw-skills`, `claude-skills` topics
- Format: raw SKILL.md + additional files
- Auto-detects `main` or `master` branch

**Vercel** (`vercel.ts`)
- Source: `https://raw.githubusercontent.com/vercel/agent-resources/main/skills`
- Format: SKILL.md + index.json
- Official Vercel skills for React/Next.js/AI SDK

**Anthropic** (`anthropic.ts`)
- Source: `https://raw.githubusercontent.com/anthropics/skills/main`
- Format: SKILL.md + index.json
- Official Anthropic skills

**Agent Skills** (`agentskills` source in `skill.ts`)
- Source: `https://github.com/<owner>/<repo>` with a top-level `skills/` directory
- Format: SKILL.md + optional `scripts/`, `references/`, `assets/`
- Install one skill: `agentskills:owner/repo/skill-name`
- Install all skills: `agentskills:owner/repo`
- Compatible with skills installed via `npx skills add`

## SkillManager

```ts
const manager = new SkillManager({
  lockFilePath: "/path/to/skills-lock.json",
  skillsDir: "/path/to/.projectflows/skill"
})

// Search across registries
const results = await manager.search("filesystem", ["clawhub", "github"])

// Install skill
await manager.install("openclaw/filesystem", {
  registry: "clawhub",
  version: "1.0.2"
})

// Update skill
await manager.update("filesystem")

// Uninstall skill
await manager.uninstall("filesystem")

// List installed
const installed = await manager.list()

// Get metadata
const meta = await manager.metadata("filesystem")
```

## SkillLoader

```ts
const loader = new SkillLoader({
  skillDirs: [
    "/workspace/.projectflows/skill",      // highest priority
    "/home/user/.projectflows/skills",     // user-level
    "/app/bundled/skills"              // bundled (lowest)
  ],
  lockFilePath: "/path/to/skills-lock.json"
})

// Load all skills (respects precedence)
const all = await loader.all()

// Get specific skill
const skill = await loader.get("filesystem")

// Force reload
await loader.reload()
```

## Precedence rules

When same skill name exists in multiple locations:

1. **Workspace** (`.projectflows/skill/<name>`) — highest priority
2. **User** (`~/.projectflows/skills/<name>`)
3. **Bundled** (shipped with Projectflows) — lowest priority

**First match wins.** Loader stops at first `SKILL.md` found.

## Registry auto-detection

Source format determines registry:

- `clawhub.ai/...` or `clawhub:...` → ClawHub
- `owner/repo` or `github.com/...` → GitHub
- `vercel.com/...` or `vercel:...` → Vercel
- `anthropic` or `anthropics` → Anthropic
- `agentskills:owner/repo` or `agentskills:owner/repo/skill-name` → Agent Skills monorepo
- Default: ClawHub

## Security

**ClawHub skills:**
- VirusTotal scan before install
- Warnings shown to user
- Errors block install (unless `skipVerify: true`)

**Other registries:**
- No automated scanning
- User responsible for vetting

## Integration with tools

Tools in `packages/tools/skills/`:

- `skill_discover` — list available skills (existing)
- `skill_load` — load skill content (existing)
- `skill_search` — search across registries (new)
- `skill_install` — install from registry (new)
- `skill_list` — list installed skills (new)

Host services extended in `packages/tools/host.ts`:

```ts
skills?: {
  all(): Promise<Skill[]>
  get(name: string): Promise<Skill | undefined>
  search?(query: string, registries?: string[]): Promise<SkillSearchResult[]>
  install?(source: string, options?: InstallOptions): Promise<void>
  update?(name: string): Promise<void>
  uninstall?(name: string): Promise<void>
  list?(): Promise<SkillMetadata[]>
}
```

## Common mistakes

- **Not awaiting install** — `manager.install()` is async, must await
- **Forgetting precedence** — workspace skills override user/bundled
- **Hardcoding registry** — let auto-detection work unless specific registry needed
- **Skipping verification** — ClawHub skills should be verified for security
- **Not updating lock file** — manager handles this, don't manually edit
- **Assuming skill exists** — always check `loader.get()` returns non-null

## Adding a new registry

1. Create `src/registries/my-registry.ts`
2. Implement `SkillRegistry` interface
3. Add to `SkillManager` constructor
4. Update `detectRegistry()` logic
5. Add to `SkillSourceType` enum in `types.ts`
6. Document in this file

## Testing

```ts
// In-memory testing
const manager = new SkillManager({
  lockFilePath: "/tmp/test-lock.json",
  skillsDir: "/tmp/test-skills"
})

// Mock registry
class MockRegistry implements SkillRegistry {
  name = "mock"
  async search() { return [] }
  async fetch() { return mockBundle }
}
```
