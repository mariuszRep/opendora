import {
  streamText,
  wrapLanguageModel,
  type ModelMessage,
  type StreamTextResult,
  type Tool,
  type ToolSet,
  tool,
  jsonSchema,
} from "ai"
import { mergeDeep, pipe } from "remeda"
import { getConfig } from "./config.ts"
import type { MessageV2 } from "./message-v2.ts"
import { SystemPrompt } from "./system.ts"

const log = {
  clone() { return this },
  tag(_k: string, _v: string) { return this },
  info(_msg: string, _data?: any) {},
  error(_msg: string, _data?: any) {},
  time(_msg: string) { return { [Symbol.dispose]() {} } },
}

export namespace LLM {
  export const OUTPUT_TOKEN_MAX = 32_000

  export type StreamInput = {
    user: MessageV2.User
    sessionID: string
    model: any
    agent: any
    system: string[]
    abort: AbortSignal
    messages: ModelMessage[]
    small?: boolean
    tools: Record<string, Tool>
    retries?: number
    toolChoice?: "auto" | "required" | "none"
  }

  export type StreamOutput = StreamTextResult<ToolSet, unknown>

  export async function stream(input: StreamInput) {
    const cfg = getConfig()
    const l = log
      .clone()
      .tag("providerID", input.model.providerID)
      .tag("modelID", input.model.id)
      .tag("sessionID", input.sessionID)
      .tag("small", (input.small ?? false).toString())
      .tag("agent", input.agent.name)
      .tag("mode", input.agent.mode)
    l.info("stream", {
      modelID: input.model.id,
      providerID: input.model.providerID,
    })
    const [language, cfg2, provider] = await Promise.all([
      cfg.provider?.getLanguage(input.model),
      cfg.config?.get() ?? Promise.resolve({}),
      cfg.provider?.getProvider(input.model.providerID),
    ])
    const isCodex = provider?.id === "openai-codex"

    const system: string[] = []

    // Build tool restriction notice based on agent config
    let toolNotice = ""
    if (input.agent.tools !== undefined) {
      if (input.agent.tools.length > 0) {
        toolNotice = `\n\n# IMPORTANT: TOOL ACCESS RESTRICTIONS\nYou have access to ONLY these specific tools: ${input.agent.tools.join(", ")}\nYou CANNOT use any other tools for any reason.\nIf your persona mentions other tools, IGNORE those instructions - you can only use the tools listed above.\nDo not attempt to use tools not in this list under any circumstances.`
      } else {
        toolNotice = `\n\n# IMPORTANT: NO TOOLS AVAILABLE\nYou have NO tools available. You can only respond with text.\nIf your persona mentions using tools, IGNORE those instructions - you cannot use any tools.\nDo not attempt to use any tools under any circumstances.`
      }
    }

    // Build delegate restriction notice — only shown when the agent actually has the delegate tool
    let delegateNotice = ""
    const hasDelegateTool = (input.agent.tools as string[] | undefined)?.includes("delegate")
    const allowedAgentNames: string[] | undefined = hasDelegateTool
      ? input.agent.config?.toolConfig?.delegate?.allowedAgents
      : undefined
    if (allowedAgentNames && allowedAgentNames.length > 0) {
      const allAgents = await cfg.agent?.list?.() ?? []
      const entries = (allAgents as any[])
        .filter((a) => allowedAgentNames.includes(a.name))
        .map((a) => `- ${a.name}${a.description ? `: ${a.description}` : ""}`)
      delegateNotice = `\n\n# IMPORTANT: DELEGATION RESTRICTIONS\nYou may only delegate to the following agents:\n${entries.join("\n")}\nDo not delegate to any other agent. If your persona mentions other agents, disregard those names.`
    }

    system.push(
      [
        ...(input.agent.prompt ? [input.agent.prompt] : isCodex ? [] : SystemPrompt.provider(input.model)),
        ...input.system,
        ...(input.user.system ? [input.user.system] : []),
        ...(toolNotice ? [toolNotice] : []),
        ...(delegateNotice ? [delegateNotice] : []),
      ]
        .filter((x) => x)
        .join("\n"),
    )

    const header = system[0]
    await cfg.plugin?.trigger(
      "experimental.chat.system.transform",
      { sessionID: input.sessionID, model: input.model },
      { system },
    )
    // rejoin to maintain 2-part structure for caching if header unchanged
    if (system.length > 2 && system[0] === header) {
      const rest = system.slice(1)
      system.length = 0
      system.push(header, rest.join("\n"))
    }

    const variant =
      !input.small && input.model.variants && input.user.variant ? input.model.variants[input.user.variant] : {}
    const base = input.small
      ? cfg.providerTransform?.smallOptions(input.model)
      : cfg.providerTransform?.options({
          model: input.model,
          sessionID: input.sessionID,
          providerOptions: provider?.options,
        })
    const options: Record<string, any> = pipe(
      base ?? {},
      mergeDeep(input.model.options ?? {}),
      mergeDeep(input.agent.options ?? {}),
      mergeDeep(variant ?? {}),
    )
    if (isCodex) {
      options.instructions = SystemPrompt.instructions()
    }

    const params = await cfg.plugin?.trigger(
      "chat.params",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        provider,
        message: input.user,
      },
      {
        temperature: input.model.capabilities?.temperature
          ? (input.agent.temperature ?? cfg.providerTransform?.temperature(input.model))
          : undefined,
        topP: input.agent.topP ?? cfg.providerTransform?.topP(input.model),
        topK: cfg.providerTransform?.topK(input.model),
        options,
      },
    ) ?? {
      temperature: input.model.capabilities?.temperature
        ? (input.agent.temperature ?? cfg.providerTransform?.temperature(input.model))
        : undefined,
      topP: input.agent.topP ?? cfg.providerTransform?.topP(input.model),
      topK: cfg.providerTransform?.topK(input.model),
      options,
    }

    const { headers } = await cfg.plugin?.trigger(
      "chat.headers",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        provider,
        message: input.user,
      },
      {
        headers: {},
      },
    ) ?? { headers: {} }

    const maxOutputTokens =
      isCodex || provider?.id?.includes("github-copilot")
        ? undefined
        : cfg.providerTransform?.maxOutputTokens(input.model)

    const tools = await resolveTools(input)

    // LiteLLM and some Anthropic proxies require the tools parameter to be present
    // when message history contains tool calls, even if no tools are being used.
    const isLiteLLMProxy =
      provider?.options?.["litellmProxy"] === true ||
      input.model.providerID.toLowerCase().includes("litellm") ||
      input.model.api.id.toLowerCase().includes("litellm")

    if (isLiteLLMProxy && Object.keys(tools).length === 0 && hasToolCalls(input.messages)) {
      tools["_noop"] = tool({
        description:
          "Placeholder for LiteLLM/Anthropic proxy compatibility - required when message history contains tool calls but no active tools are needed",
        inputSchema: jsonSchema({ type: "object", properties: {} }),
        execute: async () => ({ output: "", title: "", metadata: {} }),
      })
    }

    return streamText({
      onError(error) {
        l.error("stream error", {
          error,
        })
      },
      async experimental_repairToolCall(failed) {
        const lower = failed.toolCall.toolName.toLowerCase()
        if (lower !== failed.toolCall.toolName && tools[lower]) {
          l.info("repairing tool call", {
            tool: failed.toolCall.toolName,
            repaired: lower,
          })
          return {
            ...failed.toolCall,
            toolName: lower,
          }
        }
        return {
          ...failed.toolCall,
          input: JSON.stringify({
            tool: failed.toolCall.toolName,
            error: failed.error.message,
          }),
          toolName: "invalid",
        }
      },
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      providerOptions: cfg.providerTransform?.providerOptions(input.model, params.options),
      activeTools: Object.keys(tools).filter((x) => x !== "invalid"),
      tools,
      toolChoice: input.toolChoice,
      maxOutputTokens,
      abortSignal: input.abort,
      headers: {
        ...(input.model.providerID.startsWith("opencode")
          ? {
              "x-opencode-project": cfg.instance?.project?.id ?? "unknown",
              "x-opencode-session": input.sessionID,
              "x-opencode-request": input.user.id,
              "x-opencode-client": process.env.OPENCODE_CLIENT ?? "",
            }
          : input.model.providerID !== "anthropic"
            ? {
                "User-Agent": `opencode/${cfg.installationVersion ?? "local"}`,
              }
            : undefined),
        ...input.model.headers,
        ...headers,
      },
      maxRetries: input.retries ?? 0,
      messages: [
        ...system.map(
          (x): ModelMessage => ({
            role: "system",
            content: x,
          }),
        ),
        ...input.messages,
      ],
      model: wrapLanguageModel({
        model: language,
        middleware: [
          {
            async transformParams(args) {
              if (args.type === "stream") {
                // @ts-expect-error
                args.params.prompt = cfg.providerTransform?.message(args.params.prompt, input.model, options)
              }
              return args.params
            },
          },
        ],
      }),
      experimental_telemetry: {
        isEnabled: cfg2?.experimental?.openTelemetry,
        metadata: {
          userId: cfg2?.username ?? "unknown",
          sessionId: input.sessionID,
        },
      },
    })
  }

  export function filterToolsByAgent(
    tools: Record<string, Tool>,
    agent: any,
    userTools?: Record<string, boolean>,
  ): Record<string, Tool> {
    const cfg = getConfig()
    const disabled = cfg.permissionNext?.disabled(Object.keys(tools), agent.permission) ?? new Set<string>()

    // Apply agent's tools filter
    const allowedTools = new Set(agent.tools || [])

    for (const t of Object.keys(tools)) {
      // Always keep "invalid" tool - it's used internally for tool-call repair
      if (t === "invalid") continue

      // Filter by agent's tools configuration
      if (agent.tools) {
        if (agent.tools.length === 0) {
          delete tools[t]
          continue
        }
        if (!allowedTools.has(t)) {
          delete tools[t]
          continue
        }
      }

      // Apply user-level filtering
      if (userTools?.[t] === false) {
        delete tools[t]
        continue
      }

      // Apply permission filtering only if tool is not explicitly in agent's tools array
      if (disabled.has(t) && !agent.tools?.includes(t)) {
        delete tools[t]
      }
    }

    return tools
  }

  async function resolveTools(input: Pick<StreamInput, "tools" | "agent" | "user">) {
    return filterToolsByAgent(input.tools, input.agent, input.user.tools)
  }

  // Check if messages contain any tool-call content
  export function hasToolCalls(messages: ModelMessage[]): boolean {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue
      for (const part of msg.content) {
        if (part.type === "tool-call" || part.type === "tool-result") return true
      }
    }
    return false
  }
}
