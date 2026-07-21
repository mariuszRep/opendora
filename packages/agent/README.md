# @projectflows/agent

File-based agent management system for Projectflows.

## Overview

All agents are file-based. Default agent content is installed from registry plugins during onboarding/core setup; this package manages the installed files and does not bundle or seed persona content.

## Key Features

✅ **All agents are editable** - Including build, plan, explore, etc.
✅ **Tool restrictions work correctly** - Select exactly which tools each agent can use
✅ **Plugin-installed defaults** - Default personas come from the registry
✅ **Clean separation** - Agent logic is isolated from Projectflows core
✅ **No global state** - All functions take a `baseDirectory` parameter

## Architecture

```
packages/agent/
├── src/
│   ├── storage.ts          # File I/O operations
│   └── index.ts            # Main API
└── package.json
```

## Usage

### Basic Operations

```typescript
import { Agent } from "@projectflows/agent"

// List installed agents
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

Agents are stored in `.projectflows/agents/`:

```
.projectflows/
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

## Default Agents

The registry's `agents-default` plugin installs the core default agents, including `compaction`, `title`, and `summary`. Reinstall or update that plugin to restore registry-provided content; this package deliberately has no embedded template fallback.

## Migration from Old System

The old system had hardcoded templates in core source and a first-run seed path.

The new system:
- All agents are file-based
- Installed from plugins during onboarding/core setup
- Tool filtering works correctly
- Agents are editable and deletable

## Testing

Run the test suite:

```bash
bun test
```

The tests verify:
- ✅ File-based agent operations
- ✅ Tool filtering (select specific tools)
- ✅ Tool clearing (allow all tools)
- ✅ Create/update/delete operations
