# @opendora/skills

Multi-hub skill management system for OpenDora. Install and manage agent skills from ClawHub, GitHub, Vercel, and Anthropic.

## Features

- **Multi-Hub Support**: Install skills from ClawHub, GitHub, Vercel, and Anthropic
- **Unified API**: Single interface for searching, installing, and managing skills
- **Security**: VirusTotal scanning for ClawHub skills
- **Precedence System**: Workspace → User → Bundled skill resolution
- **Lock File**: Track installed skills with metadata and versioning
- **Auto-Detection**: Automatically detect registry from source format

## Installation

```bash
bun add @opendora/skills
```

## Quick Start

```typescript
import { SkillManager } from "@opendora/skills/manager"
import { SkillLoader } from "@opendora/skills/loader"

// Initialize manager
const manager = new SkillManager({
  lockFilePath: ".opendora/skills-lock.json",
  skillsDir: ".opendora/skill"
})

// Search for skills
const results = await manager.search("filesystem")

// Install a skill
await manager.install("openclaw/filesystem", {
  registry: "clawhub",
  version: "1.0.2"
})

// Initialize loader
const loader = new SkillLoader({
  skillDirs: [
    ".opendora/skill",           // workspace
    "~/.opendora/skills",        // user
  ],
  lockFilePath: ".opendora/skills-lock.json"
})

// Load all skills
const skills = await loader.all()

// Get specific skill
const skill = await loader.get("filesystem")
```

## Supported Registries

### ClawHub
- **URL**: https://clawhub.ai
- **Skills**: 5200+
- **Security**: VirusTotal scanning
- **Format**: `openclaw/skill-name` or `clawhub:skill-name`

### GitHub
- **URL**: https://github.com
- **Search**: Repos with `agent-skills`, `openclaw-skills`, `claude-skills` topics
- **Format**: `owner/repo`

### Vercel
- **URL**: https://github.com/vercel/agent-resources
- **Skills**: Official Vercel skills for React/Next.js/AI SDK
- **Format**: `vercel:skill-name` or full URL

### Anthropic
- **URL**: https://github.com/anthropics/skills
- **Skills**: Official Anthropic Claude skills
- **Format**: `anthropic:skill-name` or full URL

## API Reference

### SkillManager

```typescript
class SkillManager {
  // Search for skills across registries
  search(query: string, registries?: string[]): Promise<SkillSearchResult[]>
  
  // Install a skill
  install(source: string, options?: InstallOptions): Promise<void>
  
  // Update an installed skill
  update(name: string): Promise<void>
  
  // Uninstall a skill
  uninstall(name: string): Promise<void>
  
  // List installed skills
  list(): Promise<SkillMetadata[]>
  
  // Get skill metadata
  metadata(name: string): Promise<SkillMetadata | undefined>
  
  // List available registries
  registries(): Promise<RegistryInfo[]>
}
```

### SkillLoader

```typescript
class SkillLoader {
  // Load all available skills
  all(): Promise<Skill[]>
  
  // Get a specific skill by name
  get(name: string): Promise<Skill | undefined>
  
  // Force reload skills from disk
  reload(): Promise<void>
}
```

## Skill Format

Skills are directories containing a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does
version: 1.0.0
tags: [tag1, tag2]
permissions: allow
---

# Skill Instructions

Your skill instructions in markdown...
```

## Skills Lock File

The `skills-lock.json` file tracks installed skills:

```json
{
  "version": 2,
  "registries": {
    "clawhub": {
      "url": "https://clawhub.ai",
      "enabled": true,
      "lastSync": 1744617600000
    }
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
      "location": ".opendora/skill/filesystem"
    }
  }
}
```

## Precedence Rules

When multiple skills with the same name exist:

1. **Workspace** (`.opendora/skill/<name>`) - Highest priority
2. **User** (`~/.opendora/skills/<name>`)
3. **Bundled** (shipped with OpenDora) - Lowest priority

The first match wins.

## Security

### ClawHub Skills
- Scanned with VirusTotal before installation
- Warnings displayed to user
- Errors block installation (unless `skipVerify: true`)

### Other Registries
- No automated scanning
- User responsible for vetting skills

## Examples

### Search and Install

```typescript
// Search ClawHub only
const results = await manager.search("react", ["clawhub"])

// Install from GitHub
await manager.install("vercel/ai-sdk-skills")

// Install specific version
await manager.install("openclaw/filesystem", {
  version: "1.0.2"
})
```

### Update and Uninstall

```typescript
// Update to latest version
await manager.update("filesystem")

// Uninstall skill
await manager.uninstall("filesystem")
```

### List and Query

```typescript
// List all installed skills
const installed = await manager.list()

// Get skill metadata
const meta = await manager.metadata("filesystem")

// Load skill content
const skill = await loader.get("filesystem")
console.log(skill.content)
```

## Integration with OpenDora

Skills are automatically available through the tool system:

- `skill_search` - Search for skills
- `skill_install` - Install a skill
- `skill_list` - List installed skills
- `skill_discover` - Discover available skills
- `skill_load` - Load skill content

## Contributing

To add a new registry:

1. Create `src/registries/my-registry.ts`
2. Implement the `SkillRegistry` interface
3. Add to `SkillManager` constructor
4. Update registry detection logic
5. Add to `SkillSourceType` enum

## License

MIT
