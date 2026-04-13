# Integration Guide

How to integrate the skills package into OpenDora core.

## 1. Add to package.json dependencies

```json
{
  "dependencies": {
    "@opendora/skills": "workspace:*"
  }
}
```

## 2. Initialize in core startup

```typescript
// core/src/index.ts or wherever you initialize services
import { SkillManager, SkillLoader } from "@opendora/skills"
import path from "path"
import os from "os"

const workspaceRoot = process.cwd()
const userHome = os.homedir()

// Initialize skill manager
const skillManager = new SkillManager({
  lockFilePath: path.join(workspaceRoot, ".opendora", "skills-lock.json"),
  skillsDir: path.join(workspaceRoot, ".opendora", "skill")
})

// Initialize skill loader with precedence
const skillLoader = new SkillLoader({
  skillDirs: [
    path.join(workspaceRoot, ".opendora", "skill"),      // workspace (highest)
    path.join(userHome, ".opendora", "skills"),          // user
    // Add bundled skills dir if you ship any
  ],
  lockFilePath: path.join(workspaceRoot, ".opendora", "skills-lock.json")
})
```

## 3. Wire into host services

```typescript
// packages/session/src/prompt.ts or wherever you build host services
import type { SkillManager, SkillLoader } from "@opendora/skills"

// Add to your service initialization
const hostServices = {
  // ... existing services
  skills: {
    // Existing methods (from loader)
    all: () => skillLoader.all(),
    get: (name: string) => skillLoader.get(name),
    run: async (name: string, prompt: string, context: unknown) => {
      // Your existing run implementation
    },
    
    // New methods (from manager)
    search: (query: string, registries?: string[]) => 
      skillManager.search(query, registries),
    
    install: async (source: string, options?: any) => {
      await skillManager.install(source, options)
      await skillLoader.reload() // Reload after install
    },
    
    update: async (name: string) => {
      await skillManager.update(name)
      await skillLoader.reload() // Reload after update
    },
    
    uninstall: async (name: string) => {
      await skillManager.uninstall(name)
      await skillLoader.reload() // Reload after uninstall
    },
    
    list: () => skillManager.list(),
  }
}
```

## 4. Register new tools

```typescript
// Where you register tools (e.g., core/src/tools.ts)
import {
  SkillDiscoverTool,
  SkillLoadTool,
  SkillSearchTool,
  SkillInstallTool,
  SkillListTool
} from "@opendora/tools/skills"

const tools = [
  // ... existing tools
  await SkillDiscoverTool(),
  await SkillLoadTool(),
  await SkillSearchTool(),
  await SkillInstallTool(),
  await SkillListTool(),
]
```

## 5. CLI Commands (optional)

Add CLI commands for skill management:

```typescript
// core/src/cli/skills.ts
import { SkillManager } from "@opendora/skills"
import yargs from "yargs"

export const skillsCommand = {
  command: "skills",
  describe: "Manage agent skills",
  builder: (yargs: any) => {
    return yargs
      .command("search <query>", "Search for skills", {}, async (argv: any) => {
        const manager = createSkillManager()
        const results = await manager.search(argv.query)
        console.table(results)
      })
      .command("install <source>", "Install a skill", {
        registry: { type: "string", alias: "r" },
        version: { type: "string", alias: "v" }
      }, async (argv: any) => {
        const manager = createSkillManager()
        await manager.install(argv.source, {
          registry: argv.registry,
          version: argv.version
        })
        console.log(`✓ Installed ${argv.source}`)
      })
      .command("list", "List installed skills", {}, async () => {
        const manager = createSkillManager()
        const skills = await manager.list()
        console.table(skills)
      })
      .command("update <name>", "Update a skill", {}, async (argv: any) => {
        const manager = createSkillManager()
        await manager.update(argv.name)
        console.log(`✓ Updated ${argv.name}`)
      })
      .command("uninstall <name>", "Uninstall a skill", {}, async (argv: any) => {
        const manager = createSkillManager()
        await manager.uninstall(argv.name)
        console.log(`✓ Uninstalled ${argv.name}`)
      })
  }
}

function createSkillManager() {
  return new SkillManager({
    lockFilePath: ".opendora/skills-lock.json",
    skillsDir: ".opendora/skill"
  })
}
```

## 6. Usage Examples

### From CLI

```bash
# Search for skills
opendora skills search filesystem

# Install from ClawHub
opendora skills install openclaw/filesystem

# Install from GitHub
opendora skills install shadcn/ui

# Install from Vercel
opendora skills install vercel:nextjs

# List installed skills
opendora skills list

# Update a skill
opendora skills update filesystem

# Uninstall a skill
opendora skills uninstall filesystem
```

### From Agent Tools

Agents can now use these tools:

```
User: Search for React skills

Agent: <uses skill_search tool>
  query: "react"
  registries: ["vercel", "anthropic"]

User: Install the Vercel React skill

Agent: <uses skill_install tool>
  source: "vercel:react"
  registry: "vercel"

User: What skills do I have installed?

Agent: <uses skill_list tool>
```

### Programmatic Usage

```typescript
import { SkillManager, SkillLoader } from "@opendora/skills"

// Search
const results = await skillManager.search("filesystem", ["clawhub"])
console.log(`Found ${results.length} skills`)

// Install
await skillManager.install("openclaw/filesystem", {
  registry: "clawhub",
  version: "1.0.2"
})

// Load and use
const skill = await skillLoader.get("filesystem")
if (skill) {
  console.log(skill.content)
}
```

## 7. Directory Structure

After integration, your workspace will look like:

```
project/
├── .opendora/
│   ├── skills-lock.json          ← tracks installed skills
│   └── skill/                    ← installed skills
│       ├── filesystem/
│       │   ├── SKILL.md
│       │   └── ...
│       ├── shadcn/
│       │   ├── SKILL.md
│       │   └── ...
│       └── ...
├── packages/
│   └── skills/                   ← this package
└── ...
```

## 8. Migration from Existing System

If you have existing skills in `.opendora/skill/`:

1. They will continue to work (loader discovers them)
2. Run `opendora skills list` to see what's installed
3. For skills not in lock file, they'll be loaded but not tracked
4. Optionally reinstall them to add to lock file:
   ```bash
   opendora skills install <source>
   ```

## 9. Testing Integration

```typescript
// Test skill search
const results = await skillManager.search("test")
assert(Array.isArray(results))

// Test skill install
await skillManager.install("openclaw/test-skill")
const installed = await skillManager.list()
assert(installed.some(s => s.name === "test-skill"))

// Test skill loading
const skill = await skillLoader.get("test-skill")
assert(skill !== undefined)
assert(skill.content.length > 0)

// Test skill uninstall
await skillManager.uninstall("test-skill")
const remaining = await skillManager.list()
assert(!remaining.some(s => s.name === "test-skill"))
```

## 10. Configuration

Add to `.opendora/opendora.json`:

```json
{
  "skills": {
    "registries": {
      "clawhub": { "enabled": true },
      "github": { "enabled": true },
      "vercel": { "enabled": false },
      "anthropic": { "enabled": true }
    },
    "autoUpdate": false,
    "verifyClawHub": true
  }
}
```

## Notes

- Skills are stored in `.opendora/skill/` (note: singular, matching your existing structure)
- Lock file is `.opendora/skills-lock.json` (note: plural, for clarity)
- Workspace skills always take precedence over user/bundled
- ClawHub skills are verified by default (can be disabled with `skipVerify: true`)
- All operations are async - always await them
