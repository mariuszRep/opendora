# OpenCode Chat CLI

A standalone CLI tool for sending messages to OpenCode sessions via the HTTP API.

## Features

- **Cloud Mode**: Connect to OpenCode's hosted API directly (no local server needed)
- **Local Mode**: Connect to a locally running OpenCode server
- Automatic session creation in cloud mode
- Token usage tracking

## Installation

### Local development
```bash
cd /home/mariu/projects/opendora/opencode-chat
bun install
```

### Global installation (optional)
```bash
cd /home/mariu/projects/opendora/opencode-chat
bun install
bun link
```

## Usage

### Cloud Mode (Default - No Local Server Required)

Connects directly to OpenCode's hosted API:

```bash
bun run cli.ts --api-key YOUR_API_KEY "your message"
```

Or using environment variable:
```bash
export OPENCODE_API_KEY="your-api-key"
bun run cli.ts "your message"
```

With existing session:
```bash
bun run cli.ts --api-key YOUR_API_KEY --session ses_abc123 "your message"
```

### Local Mode (Requires Local OpenCode Server)

Connects to a locally running OpenCode server:

```bash
bun run cli.ts --local --session ses_abc123 "your message"
```

Or using environment variables:
```bash
export OPENCODE_SESSION_ID="ses_1bfa25b16ffeQTGDSDJdsy6Blg"
bun run cli.ts --local "your message"
```

## Options

### Cloud Mode Options
- `--api-key, -k <key>` - OpenCode API key (required for cloud mode)
- `--server, -s <url>` - OpenCode API URL (default: https://api.opencode.ai)
- `--session, -i <id>` - Session ID (optional, creates new session if not provided)

### Local Mode Options
- `--local, -l` - Use local server mode
- `--server, -s <url>` - Local server URL (default: http://127.0.0.1:40215)
- `--session, -i <id>` - Session ID (required for local mode)

### Common Options
- `--help, -h` - Show help message

## Environment Variables

- `OPENCODE_API_KEY` - API key for cloud mode
- `OPENCODE_SERVER_URL` - Server URL
- `OPENCODE_SESSION_ID` - Default session ID

## Examples

```bash
# Cloud mode - simple message
bun run cli.ts -k your-api-key "hello, can you help me?"

# Cloud mode - with existing session
bun run cli.ts -k your-api-key -i ses_abc123 "what is 2+2?"

# Cloud mode - using env var
export OPENCODE_API_KEY="your-api-key"
bun run cli.ts "explain this code"

# Local mode - with local server
bun run cli.ts --local --session ses_abc123 "hello"

# Local mode - with custom server URL
bun run cli.ts -l -s http://localhost:3000 -i ses_abc123 "test"
```

## Requirements

### Cloud Mode
- Bun runtime
- OpenCode API key (get from [opencode.ai](https://opencode.ai))
- Internet connection

### Local Mode
- Bun runtime
- OpenCode server running locally with HTTP API enabled
- Valid session ID from an existing OpenCode session

## Architecture

**Cloud Mode:**
```
CLI → OpenCode Cloud API → BigPickle/LLM Providers → Response
```

**Local Mode:**
```
CLI → Local OpenCode Server → LLM Providers → Response
```
