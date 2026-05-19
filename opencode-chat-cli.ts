#!/usr/bin/env bun
/**
 * Simple CLI to send a message to an OpenCode session and receive the reply
 * Usage: bun opencode-chat-cli.ts "your message here"
 */

const SERVER_URL = process.env.OPENCODE_SERVER_URL || "http://127.0.0.1:4097"
const SESSION_ID = process.env.OPENCODE_SESSION_ID || "ses_1bfe90591ffeIGjC33DpJrjhFX"

async function sendMessage(message: string) {
  const url = `${SERVER_URL}/session/${SESSION_ID}/message`
  
  const payload = {
    parts: [
      {
        type: "text",
        text: message
      }
    ]
  }

  console.log(`Sending message to session ${SESSION_ID}...`)
  console.log(`Message: ${message}`)
  console.log()

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    // Parse the JSON response
    const data = await response.json() as {
      parts?: Array<{ type: string; text?: string }>
      info?: { tokens?: { total?: number; input?: number; output?: number } }
    }
    
    // Extract the assistant's text reply
    if (data.parts && Array.isArray(data.parts)) {
      const textParts = data.parts.filter((p) => p.type === "text" && p.text)
      if (textParts.length > 0) {
        console.log("Assistant's reply:")
        console.log("---")
        textParts.forEach((part) => console.log(part.text))
        console.log("---")
      } else {
        console.log("No text response received")
      }
    } else {
      console.log("Unexpected response format")
    }

    // Show token usage if available
    if (data.info?.tokens) {
      console.log(`\nTokens used: ${data.info.tokens.total} (input: ${data.info.tokens.input}, output: ${data.info.tokens.output})`)
    }

  } catch (error) {
    console.error("Error sending message:", error)
    process.exit(1)
  }
}

// Get message from command line argument
const message = process.argv[2]

if (!message) {
  console.error("Usage: bun opencode-chat-cli.ts \"your message here\"")
  process.exit(1)
}

sendMessage(message)
