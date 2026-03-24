import { Auth } from "@opendora/core/auth"
import { GoogleOAuth } from "./google-oauth"

const CODE_ASSIST_BASE = "https://cloudcode-pa.googleapis.com/v1internal"

// Models that do not support thinking — thinkingConfig must be stripped entirely
const NON_REASONING_MODELS = new Set(["gemini-2.5-flash-lite"])

let cachedProjectId: string | undefined

async function loadProjectId(accessToken: string): Promise<string | undefined> {
  if (cachedProjectId !== undefined) return cachedProjectId
  try {
    const res = await fetch(`${CODE_ASSIST_BASE}:loadCodeAssist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" } }),
    })
    if (res.ok) {
      const data = (await res.json()) as { cloudaicompanionProject?: string }
      cachedProjectId = data.cloudaicompanionProject ?? ""
    }
  } catch {
    // project ID is optional; free-tier users may not need it
  }
  return cachedProjectId
}

function patchGenerationConfig(gc: Record<string, any>, modelId: string) {
  if (gc?.thinkingConfig === undefined) return
  if (NON_REASONING_MODELS.has(modelId)) {
    delete gc.thinkingConfig
  } else if (gc.thinkingConfig.includeThoughts && gc.thinkingConfig.thinkingBudget === undefined) {
    // Vertex API requires thinkingBudget when includeThoughts is set
    gc.thinkingConfig.thinkingBudget = -1 // -1 = dynamic
  }
}

function unwrapCodeAssistSse(response: Response): Response {
  if (!response.body) return response
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("event-stream")) return response

  let lineBuffer = ""
  const transformed = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          lineBuffer += chunk
          const lines = lineBuffer.split("\n")
          lineBuffer = lines.pop() ?? ""
          const out = lines
            .map((line) => {
              if (!line.startsWith("data: ")) return line
              const dataStr = line.slice(6).trim()
              if (!dataStr || dataStr === "[DONE]") return line
              try {
                const parsed = JSON.parse(dataStr)
                if (parsed.response !== undefined) return "data: " + JSON.stringify(parsed.response)
              } catch {}
              return line
            })
            .join("\n")
          controller.enqueue(out + "\n")
        },
        flush(controller) {
          if (!lineBuffer) return
          const line = lineBuffer
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim()
            if (dataStr && dataStr !== "[DONE]") {
              try {
                const parsed = JSON.parse(dataStr)
                if (parsed.response !== undefined) {
                  controller.enqueue("data: " + JSON.stringify(parsed.response))
                  return
                }
              } catch {}
            }
          }
          controller.enqueue(line)
        },
      }),
    )
    .pipeThrough(new TextEncoderStream())

  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

async function getAccessToken(): Promise<string> {
  const auth = await Auth.get("google-gemini-cli")
  if (auth?.type !== "oauth") throw new Error("OAuth credentials not found for Gemini CLI")

  if (auth.expires && Date.now() >= auth.expires - 60_000) {
    if (!auth.refresh) throw new Error("Refresh token not available")
    const refreshed = await GoogleOAuth.refreshAccessToken(auth.refresh)
    await Auth.set("google-gemini-cli", {
      type: "oauth",
      access: refreshed.access_token,
      refresh: auth.refresh,
      expires: refreshed.expiry_date,
      accountId: auth.accountId,
    })
    return refreshed.access_token
  }

  return auth.access
}

export async function createGeminiCliLoader() {
  const auth = await Auth.get("google-gemini-cli")
  if (auth?.type !== "oauth") return { autoload: false }

  return {
    autoload: true,
    options: {
      fetch: async (requestInput: RequestInfo | URL, init?: RequestInit) => {
        const accessToken = await getAccessToken()

        const headers = new Headers(init?.headers)
        headers.delete("x-goog-api-key")
        headers.set("Authorization", `Bearer ${accessToken}`)
        headers.set("Content-Type", "application/json")

        // Rewrite URL: @ai-sdk/google builds /{version}/models/{model}:{method}
        // Code Assist expects /{version}:{method}
        const originalUrl = typeof requestInput === "string" ? requestInput : requestInput.toString()
        const [urlPath = "", queryString] = originalUrl.split("?")
        const modelId = urlPath.match(/\/models\/([^/:]+)/)?.[1]
        const method = urlPath.match(/:(\w+)$/)?.[1] ?? "streamGenerateContent"
        const codeAssistUrl = `${CODE_ASSIST_BASE}:${method}${queryString ? "?" + queryString : ""}`

        let body: string | undefined
        if (init?.body && typeof init.body === "string" && modelId) {
          try {
            const sdkBody = JSON.parse(init.body)
            patchGenerationConfig(sdkBody.generationConfig, modelId)
            const projectId = await loadProjectId(accessToken)
            body = JSON.stringify({
              model: modelId,
              project: projectId || undefined,
              user_prompt_id: crypto.randomUUID(),
              request: sdkBody,
            })
          } catch {
            body = init.body as string
          }
        } else {
          body = init?.body as string | undefined
        }

        const response = await fetch(codeAssistUrl, { ...init, headers, body })
        return unwrapCodeAssistSse(response)
      },
    },
  }
}
