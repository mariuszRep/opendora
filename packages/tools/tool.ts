import z from "zod"
import { apply as applyTruncation } from "./truncation.ts"

export namespace Tool {
  interface Metadata {
    [key: string]: any
  }

  export interface AgentInfo {
    id?: string
    name?: string
    description?: string
    mode?: string
    permission?: unknown
    config?: {
      toolConfig?: {
        delegate?: { allowedAgents?: string[] }
        reply?: { stopAfterReply?: boolean }
      }
      defaultPaths?: string[]
      sandbox?: boolean
      skills?: string[]
    }
    /** Resolved agent entries for the delegate tool's allowed list, and (via id) the caller's implicitly-granted agent__<id> dynamic tools */
    delegateAgents?: Array<{ id: string; name: string; description?: string }>
    /** Raw agent-scoped delegate-target permission rules (resource "agent"), including deny/ask — for hard-block checks in delegate/task tools */
    delegateRules?: Array<{ pattern: string; action: "allow" | "deny" | "ask" }>
    /** Skills allocated to this agent — skill_load is restricted to this list if non-empty */
    skills?: string[]
    /** Workflows allocated to this agent — workflow_run is restricted to this list if non-empty */
    workflows?: string[]
  }

  export interface InitContext {
    agent?: AgentInfo
    model?: { providerID: string; modelID: string }
  }

  export interface AskInput {
    permission: string
    patterns?: string[]
    always?: string[]
    explanation?: string
    metadata?: Record<string, unknown>
  }

  export type Context<M extends Metadata = Metadata> = {
    sessionID: string
    messageID: string
    agent: string
    abort: AbortSignal
    callID?: string
    extra?: { [key: string]: any }
    messages: unknown[]
    metadata(input: { title?: string; metadata?: M }): void
    ask(input: AskInput): Promise<void>
  }

  export interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string
      parameters: Parameters
      execute(
        args: z.infer<Parameters>,
        ctx: Context,
      ): Promise<{
        title: string
        metadata: M
        output: string
        /** Optional structured payload alongside `output` — for downstream/programmatic consumption (e.g. workflow resultPath). `output` remains the MCP-compatible human-readable field. */
        outputObject?: unknown
        attachments?: unknown[]
      }>
      formatValidationError?(error: z.ZodError): string
    }>
  }

  export type InferParameters<T extends Info> = T extends Info<infer P> ? z.infer<P> : never
  export type InferMetadata<T extends Info> = T extends Info<any, infer M> ? M : never

  export function define<Parameters extends z.ZodType, Result extends Metadata>(
    id: string,
    init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (initCtx) => {
        const toolInfo = init instanceof Function ? await init(initCtx) : init
        const execute = toolInfo.execute
        toolInfo.execute = async (args, ctx) => {
          let parsedArgs: z.infer<Parameters>
          try {
            parsedArgs = toolInfo.parameters.parse(args)
          } catch (error) {
            if (error instanceof z.ZodError && toolInfo.formatValidationError) {
              throw new Error(toolInfo.formatValidationError(error), { cause: error })
            }
            throw new Error(
              `The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`,
              { cause: error },
            )
          }
          const result = await execute(parsedArgs, ctx)
          if (result.metadata.truncated !== undefined) {
            return result
          }
          const truncated = await applyTruncation(result.output, initCtx?.agent)
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,
              ...(truncated.truncated && { outputPath: (truncated as any).outputPath }),
            },
          }
        }
        return toolInfo
      },
    }
  }
}
