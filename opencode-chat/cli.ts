#!/usr/bin/env bun
/**
 * OpenCode Chat CLI
 * A standalone CLI to send messages to OpenCode sessions
 * 
 * Can work in two modes:
 * 1. Local server mode: Connect to a locally running OpenCode server
 * 2. Cloud mode: Connect to OpenCode's hosted API directly
 * 
 * Usage: opencode-chat [options] "your message"
 * 
 * Options:
 *   --server, -s    OpenCode server URL (default: https://api.opencode.ai for cloud mode)
 *   --session, -i   Session ID (default: creates new session in cloud mode)
 *   --project, -p   Project ID (required for opencode provider)
 *   --api-key, -k   OpenCode API key (use "public" for free tier)
 *   --local, -l     Use local server mode (default: cloud mode)
 *   --help, -h      Show help
 */

const args = process.argv.slice(2)

function showHelp() {
  console.log(`
OpenCode Chat CLI - Send messages to OpenCode sessions

Modes:
  Cloud mode (default): Connect to OpenCode's hosted API directly
  Local mode: Connect to a locally running OpenCode server

Usage:
  opencode-chat [options] "your message"

Cloud Mode Options:
  --api-key, -k <key>   OpenCode API key (use "public" for free tier)
  --server, -s <url>    OpenCode API URL (default: https://api.opencode.ai)
  --session, -i <id>    Session ID (default: creates new session)
  --project, -p <id>    Project ID (required for opencode provider)

Local Mode Options:
  --local, -l           Use local server mode
  --server, -s <url>    Local server URL (default: http://127.0.0.1:40215)
  --session, -i <id>    Session ID (required)
  --project, -p <id>    Project ID (optional)

Common Options:
  --help, -h            Show this help message

Environment Variables:
  OPENCODE_API_KEY       API key for cloud mode (use "public" for free tier)
  OPENCODE_SERVER_URL    Server URL
  OPENCODE_SESSION_ID    Default session ID
  OPENCODE_PROJECT_ID    Default project ID

Examples:
  # Cloud mode with public API key (free tier)
  opencode-chat --api-key public --project proj_abc123 "hello"
  opencode-chat -k public -p proj_abc123 -i ses_xyz "what is 2+2?"

  # Cloud mode with paid API key
  opencode-chat --api-key your-key --project proj_abc123 "hello"

  # Local mode
  opencode-chat --local --session ses_abc123 "hello"
  opencode-chat -l -s http://localhost:3000 -i ses_abc123 "explain this code"
`)
  process.exit(0)
}

function parseArgs() {
  const result = {
    server: process.env.OPENCODE_SERVER_URL || "https://opencode.ai/zen/v1",
    session: process.env.OPENCODE_SESSION_ID,
    apiKey: process.env.OPENCODE_API_KEY || "public",
    project: process.env.OPENCODE_PROJECT_ID,
    localMode: false,
    message: ""
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg) continue
    
    if (arg === "--help" || arg === "-h") {
      showHelp()
    } else if (arg === "--local" || arg === "-l") {
      result.localMode = true
      result.server = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:40215"
    } else if (arg === "--server" || arg === "-s") {
      const nextArg = args[++i]
      if (nextArg) result.server = nextArg
    } else if (arg === "--session" || arg === "-i") {
      const nextArg = args[++i]
      if (nextArg) result.session = nextArg
    } else if (arg === "--api-key" || arg === "-k") {
      const nextArg = args[++i]
      if (nextArg) result.apiKey = nextArg
    } else if (arg === "--project" || arg === "-p") {
      const nextArg = args[++i]
      if (nextArg) result.project = nextArg
    } else if (!arg.startsWith("-")) {
      result.message = arg
    }
  }

  return result
}

async function sendDirectCompletion(
  serverUrl: string, 
  message: string, 
  apiKey?: string,
  sessionId?: string,
  projectId?: string,
  model: string = "big-pickle"
) {
  const url = `${serverUrl}/chat/completions`
  
  const payload = {
    model: model,
    messages: [
      {
        role: "user",
        content: message
      }
    ]
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "opencode-chat-cli/1.0.0"
  }

  // Add OpenCode-specific headers like the server does
  if (sessionId) {
    headers["x-opencode-session"] = sessionId
  }
  if (projectId) {
    headers["x-opencode-project"] = projectId
  }
  headers["x-opencode-request"] = crypto.randomUUID()
  headers["x-opencode-client"] = "cli"

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`
  }

  console.log(`Sending message to ${model}...`)
  console.log(`Message: ${message}`)
  if (sessionId) console.log(`Session: ${sessionId}`)
  if (projectId) console.log(`Project: ${projectId}`)
  console.log()

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    // Parse the JSON response
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number }
    }
    
    // Extract the assistant's reply
    if (data.choices && data.choices.length > 0 && data.choices[0]?.message?.content) {
      console.log("Assistant's reply:")
      console.log("---")
      console.log(data.choices[0].message.content)
      console.log("---")
    } else {
      console.log("No response received")
    }

    // Show token usage if available
    if (data.usage) {
      console.log(`\nTokens used: ${data.usage.total_tokens} (input: ${data.usage.prompt_tokens}, output: ${data.usage.completion_tokens})`)
    }

  } catch (error) {
    console.error("Error sending message:", error)
    process.exit(1)
  }
}

// Main execution
const config = parseArgs()

// Validate based on mode
if (config.localMode) {
  if (!config.session) {
    console.error("Error: Session ID is required for local mode. Use --session option or set OPENCODE_SESSION_ID environment variable.")
    console.error("\nRun 'opencode-chat --help' for usage information.")
    process.exit(1)
  }
  // Local mode uses the session-based API
  console.error("Error: Local mode not yet implemented for direct completion API.")
  console.error("Please use cloud mode with --api-key public for standalone operation.")
  process.exit(1)
} else {
  // Cloud mode - direct completion API
  if (!config.apiKey) {
    console.error("Error: API key is required for cloud mode. Use --api-key option or set OPENCODE_API_KEY environment variable.")
    console.error("Use 'public' for the free tier.")
    console.error("\nRun 'opencode-chat --help' for usage information.")
    process.exit(1)
  }
  if (!config.project) {
    console.error("Error: Project ID is required for cloud mode. Use --project option or set OPENCODE_PROJECT_ID environment variable.")
    console.error("\nRun 'opencode-chat --help' for usage information.")
    process.exit(1)
  }
}

if (!config.message) {
  console.error("Error: Message is required.")
  console.error("\nRun 'opencode-chat --help' for usage information.")
  process.exit(1)
}

sendDirectCompletion(config.server, config.message, config.apiKey, config.session, config.project)
