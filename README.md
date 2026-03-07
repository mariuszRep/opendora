# OpenDora

OpenDora is an AI-powered development tool with TUI and API, forked from OpenCode. It provides a complete backend infrastructure with agents, sessions, providers, a terminal UI, and API endpoints.

## What's Included

### Packages

- **`packages/opencode`** - Core backend with:
  - **Terminal UI (TUI)** - Built-in terminal interface using @opentui
  - AI Agents (conversation logic, tool execution)
  - Session Management (conversation state, history)
  - Provider Integrations (OpenAI, Anthropic, Google, etc.)
  - API Server (Hono-based REST API)
  - Database (Drizzle ORM with SQLite)
  - Tools (file operations, command execution, code search)
  - MCP (Model Context Protocol) support
  
- **`packages/sdk`** - TypeScript SDK for API communication
  - Type-safe API client
  - WebSocket support for streaming
  
- **`packages/util`** - Shared utilities used across packages

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.3.10 or higher

### Installation

```bash
cd opendora
bun install
```

### Running OpenDora

**Start the TUI (Terminal Interface):**

```bash
bun run dev
```

This launches the interactive terminal UI for AI-powered development.

**Or run as API server only:**

```bash
bun run serve
```

This starts the API server on `http://localhost:4096` without the TUI.

### API Endpoints

The backend exposes a REST API with the following key endpoints:

- `POST /api/session` - Create a new session
- `GET /api/session/:id` - Get session details
- `POST /api/session/:id/message` - Send a message to a session
- `GET /api/session/:id/stream` - Stream session updates (WebSocket)
- `GET /api/providers` - List available AI providers
- `POST /api/tool/execute` - Execute a tool

See the OpenAPI spec at `packages/sdk/openapi.json` for full API documentation.

### Using the SDK

```typescript
import { createClient } from '@opencode-ai/sdk'

const client = createClient({
  baseUrl: 'http://localhost:4096'
})

// Create a session
const session = await client.session.create({
  projectId: 'my-project'
})

// Send a message
const response = await client.session.sendMessage(session.id, {
  content: 'Help me build a feature'
})
```

## Using the TUI or Building Your Own UI

OpenDora includes a **built-in Terminal UI (TUI)** for interactive development. You can use it as-is or build your own interface:

**Use the included TUI:**
- Run `bun run dev` to start the terminal interface
- Full-featured AI assistant in your terminal
- Keybindings, autocomplete, and rich formatting

**Or build your own UI:**
- Web UI (React, Vue, Svelte, etc.)
- Desktop app (Electron, Tauri)
- Mobile app (React Native, Flutter)
- VS Code extension
- Any other interface

Just connect to the API endpoints at `http://localhost:4096`

## Configuration

Configure the backend by setting environment variables or creating a `.env` file in `packages/opencode/`:

```bash
# AI Provider API Keys
OPENAI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
GOOGLE_API_KEY=your-key

# Database
DATABASE_PATH=./data/opencode.db

# Server
PORT=4096
```

## Development

### Project Structure

```
opendora/
├── packages/
│   ├── opencode/          # Backend core + TUI
│   │   ├── src/
│   │   │   ├── cli/       # CLI and TUI
│   │   │   │   └── cmd/tui/  # Terminal UI components
│   │   │   ├── agent/     # AI agent logic
│   │   │   ├── session/   # Session management
│   │   │   ├── provider/  # LLM provider integrations
│   │   │   ├── server/    # API server (Hono)
│   │   │   ├── tool/      # Tool implementations
│   │   │   ├── mcp/       # Model Context Protocol
│   │   │   └── ...
│   ├── sdk/               # TypeScript SDK
│   └── util/              # Shared utilities
├── package.json
└── README.md
```

### Running Tests

```bash
# From packages/opencode
cd packages/opencode
bun test
```

### Type Checking

```bash
bun run typecheck
```

## License

MIT

## Credits

Based on [OpenCode](https://github.com/anomalyco/opencode) by Anomaly Co.
