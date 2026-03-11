# @opendora/agent

Template-based agent management system for OpenDora.

## Overview

All agents are now **file-based** with no distinction between "native" and "custom" agents. Default agents are seeded from templates on first run, and can be freely edited, deleted, or reset to their template defaults.

## Key Features

✅ **All agents are editable** - Including build, plan, explore, etc.
✅ **Tool restrictions work correctly** - Select exactly which tools each agent can use
✅ **Template reset** - Restore any agent to its default template
✅ **Clean separation** - Agent logic is isolated from OpenCode core
✅ **No global state** - All functions take a `baseDirectory` parameter

## Architecture

```
packages/agent/
├── src/
│   ├── templates/          # Built-in agent templates
│   │   ├── build.ts        # Default build agent
│   │   ├── plan.ts         # Plan-mode agent
│   │   ├── explore.ts      # Codebase exploration agent
│   │   ├── general.ts      # General-purpose agent
│   │   └── ...
│   ├── storage.ts          # File I/O operations
│   └── index.ts            # Main API
└── package.json
```

## Usage

### Basic Operations

```typescript
import { Agent } from "@opendora/agent"

// List all agents (auto-seeds templates on first run)
const agents = await Agent.list(baseDirectory)

// Get a specific agent
const build = await Agent.get(baseDirectory, "build")

// Create a custom agent
await Agent.create(baseDirectory, "my-agent", {
  name: "my-agent",
  description: "Custom agent",
  mode: "all",
  tools: ["bash", "read", "write"],
}, "Persona text...")

// Update an agent
await Agent.update(baseDirectory, "explore", {
  tools: ["question"],  // Restrict to only question tool
})

// Reset to template
await Agent.resetToTemplate(baseDirectory, "build")

// Delete an agent
await Agent.remove(baseDirectory, "my-agent")
```

### Tool Filtering

The `tools` field now works correctly:

- `tools: ["bash", "read"]` - Agent can ONLY use bash and read
- `tools: []` - Agent cannot use any tools
- `tools: undefined` - Agent can use ALL available tools (default)

This was the original bug - tools weren't being filtered properly. Now they are!

## Storage

Agents are stored in `.opendora/agents/`:

```
.opendora/
└── agents/
    ├── index.json          # Agent registry
    ├── build/
    │   ├── agent.json      # Configuration
    │   └── PERSONA.md      # System prompt
    ├── explore/
    │   ├── agent.json
    │   └── PERSONA.md
    └── ...
```

## Templates

Default templates are defined in `src/templates/`:

- **build** - Default development agent (all tools)
- **plan** - Read-only planning agent
- **explore** - Codebase exploration (read-only tools)
- **general** - General-purpose sub-agent
- **compaction**, **title**, **summary** - Internal agents

Users can modify these agents freely, and reset them to templates anytime with:

```typescript
await Agent.resetToTemplate(baseDirectory, "build")
```

## Migration from Old System

The old system had:
- Hardcoded "native" agents in `agent.ts`
- Separate "file-based" agents
- Tool filtering didn't work properly

The new system:
- All agents are file-based
- Seeded from templates on first run
- Tool filtering works correctly
- Agents are fully editable and deletable

## Testing

Run the test suite:

```bash
bun test
```

The tests verify:
- ✅ Agent seeding from templates
- ✅ Tool filtering (select specific tools)
- ✅ Tool clearing (allow all tools)
- ✅ Reset to template
- ✅ Create/update/delete operations
