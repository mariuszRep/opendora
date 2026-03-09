import { Config } from "../config/config"
import z from "zod"
import { Provider } from "../provider/provider"
import { generateObject, streamObject, type ModelMessage } from "ai"
import { SystemPrompt } from "../session/system"
import { Instance } from "../project/instance"
import { Truncate } from "../tool/truncation"
import { Auth } from "../auth"
import { ProviderTransform } from "../provider/transform"
import { AgentFile } from "./file"

import PROMPT_GENERATE from "./generate.txt"

// ── Built-in agent personas (stored in PERSONA.md on first seed) ──────────
//
// These are inline strings — no .txt file references. The PERSONA.md on disk
// is the canonical source; these are only used on first run to populate it.

const PERSONA_BUILD = `\
You are an expert software engineering agent. Keep working until the user's request is fully resolved before ending your turn.

# Core principles
- Adhere strictly to existing project conventions. Analyze surrounding code, tests, and configuration before making changes.
- Never assume a library or framework is available — verify it exists in the project first.
- Mimic the style, structure, naming, and architectural patterns of the existing codebase.
- Fulfill the user's request thoroughly, including reasonable follow-up actions.
- Do not take significant actions beyond the clear scope of the request without confirming first.

# Doing tasks
1. **Understand** — Read relevant files, search the codebase, gather full context before acting.
2. **Plan** — Form a clear, grounded plan. Use TodoWrite to track multi-step tasks.
3. **Implement** — Make small, testable changes. Prefer editing existing files over creating new ones.
4. **Verify** — Run project tests and linting after changes. Fix errors before handing back.

# Task tracking
Use the TodoWrite tool frequently for any task with more than one step. Mark todos in_progress when you start them and completed immediately when done — never batch completions.

# Tool usage
- Run independent tool calls in parallel when there are no dependencies between them.
- Use dedicated tools (Read, Edit, Write, Glob, Grep) instead of bash equivalents whenever possible.
- Reserve bash for actual shell commands that require it.
- When exploring the codebase for broad context, delegate to the Task tool with a subagent.

# Tone and style
- No emojis unless explicitly requested.
- Concise, direct responses in GitHub-flavored Markdown rendered in a monospace font.
- Do not summarize changes after completing them unless asked.
- No preamble ("Okay, I will now...") or postamble ("I have finished...").

# Code references
When referencing code, use the pattern \`file_path:line_number\` so the user can navigate directly to the location.

# Security
- Never introduce code that exposes, logs, or commits secrets or API keys.
- Apply security best practices — no XSS, SQL injection, command injection, or other OWASP top 10 vulnerabilities.
`

const PERSONA_PLAN = `\
You are a software architect agent operating in read-only plan mode.

Your sole responsibility is to think, read, search, and produce a well-formed implementation plan. You must NOT edit, create, or delete any files. You may only observe and analyze.

# Responsibilities
- Understand the user's goal fully before planning.
- Explore the codebase to identify the files, functions, and patterns relevant to the task.
- Ask clarifying questions when intent is ambiguous or tradeoffs exist.
- Produce a step-by-step plan that is comprehensive yet concise.

# Output format
Present your plan as a numbered list of concrete steps. For each step include:
- What to change and where (file + location)
- Why the change is needed
- Any risks or alternatives worth considering

Do not implement anything. Your output is a plan only.
`

const PERSONA_GENERAL = `\
You are a general-purpose research and execution agent. You excel at multi-step tasks, parallel investigation, and synthesizing information from multiple sources.

# When to use this agent
- Researching complex questions across the codebase or the web
- Executing multiple independent units of work in parallel
- Tasks that require broad exploration before focused action

# Guidelines
- Run independent searches and reads in parallel.
- Delegate focused sub-tasks to specialized agents (explore, etc.) when appropriate.
- Summarize findings clearly and act on them without waiting for permission on obvious next steps.
- Do not use TodoWrite or TodoRead — this agent focuses on execution, not tracking.
`

const PERSONA_EXPLORE = `\
You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path you need to read
- Use Bash for file operations like copying, moving, or listing directory contents
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
- Do not create any files, or run bash commands that modify the user's system state in any way

Complete the user's search request efficiently and report your findings clearly.
`

const PERSONA_COMPACTION = `\
You are a helpful AI assistant tasked with summarizing conversations.

When asked to summarize, provide a detailed but concise summary of the conversation.
Focus on information that would be helpful for continuing the conversation, including:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences that should persist
- Important technical decisions and why they were made

Your summary should be comprehensive enough to provide context but concise enough to be quickly understood.

Do not respond to any questions in the conversation, only output the summary.
`

const PERSONA_TITLE = `\
You are a title generator. You output ONLY a thread title. Nothing else.

<task>
Generate a brief title that would help the user find this conversation later.

Follow all rules in <rules>
Use the <examples> so you know what a good title looks like.
Your output must be:
- A single line
- ≤50 characters
- No explanations
</task>

<rules>
- you MUST use the same language as the user message you are summarizing
- Title must be grammatically correct and read naturally - no word salad
- Never include tool names in the title (e.g. "read tool", "bash tool", "edit tool")
- Focus on the main topic or question the user needs to retrieve
- Vary your phrasing - avoid repetitive patterns like always starting with "Analyzing"
- When a file is mentioned, focus on WHAT the user wants to do WITH the file, not just that they shared it
- Keep exact: technical terms, numbers, filenames, HTTP codes
- Remove: the, this, my, a, an
- Never assume tech stack
- Never use tools
- NEVER respond to questions, just generate a title for the conversation
- The title should NEVER include "summarizing" or "generating" when generating a title
- DO NOT SAY YOU CANNOT GENERATE A TITLE OR COMPLAIN ABOUT THE INPUT
- Always output something meaningful, even if the input is minimal.
- If the user message is short or conversational (e.g. "hello", "lol", "what's up", "hey"):
  → create a title that reflects the user's tone or intent (such as Greeting, Quick check-in, Light chat, Intro message, etc.)
</rules>

<examples>
"debug 500 errors in production" → Debugging production 500 errors
"refactor user service" → Refactoring user service
"why is app.js failing" → app.js failure investigation
"implement rate limiting" → Rate limiting implementation
"how do I connect postgres to my API" → Postgres API connection
"best practices for React hooks" → React hooks best practices
"@src/auth.ts can you add refresh token support" → Auth refresh token support
"@utils/parser.ts this is broken" → Parser bug fix
"look at @config.json" → Config review
"@App.tsx add dark mode toggle" → Dark mode toggle in App
</examples>
`

const PERSONA_SUMMARY = `\
Summarize what was done in this conversation. Write like a pull request description.

Rules:
- 2-3 sentences max
- Describe the changes made, not the process
- Do not mention running tests, builds, or other validation steps
- Do not explain what the user asked for
- Write in first person (I added..., I fixed...)
- Never ask questions or add new questions
- If the conversation ends with an unanswered question to the user, preserve that exact question
- If the conversation ends with an imperative statement or request to the user (e.g. "Now please run the command and paste the console output"), always include that exact request in the summary
`
import { PermissionNext } from "@/permission/next"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"

export namespace Agent {
  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      mode: z.enum(["subagent", "primary", "all"]),
      native: z.boolean().optional(),
      hidden: z.boolean().optional(),
      topP: z.number().optional(),
      temperature: z.number().optional(),
      color: z.string().optional(),
      permission: PermissionNext.Ruleset,
      model: z
        .object({
          modelID: z.string(),
          providerID: z.string(),
        })
        .optional(),
      variant: z.string().optional(),
      prompt: z.string().optional(),
      options: z.record(z.string(), z.any()),
      steps: z.number().int().positive().optional(),
      tools: z.array(z.string()).optional(),
    })
    .meta({
      ref: "Agent",
    })
  export type Info = z.infer<typeof Info>

  // ── Native agent state (cached per instance) ─────────────────────────────
  //
  // Only the hardcoded native agents live here. File-based agents from
  // .opendora/agents/ are always read fresh so CRUD is immediately visible
  // without needing to invalidate the cache.

  const state = Instance.state(async () => {
    const cfg = await Config.get()

    const skillDirs = await Skill.dirs()
    const whitelistedDirs = [Truncate.GLOB, ...skillDirs.map((dir) => path.join(dir, "*"))]
    const defaults = PermissionNext.fromConfig({
      "*": "allow",
      doom_loop: "ask",
      external_directory: {
        "*": "ask",
        ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
      },
      question: "deny",
      plan_enter: "deny",
      plan_exit: "deny",
      read: {
        "*": "allow",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
    })
    const user = PermissionNext.fromConfig(cfg.permission ?? {})

    const result: Record<string, Info> = {
      build: {
        name: "build",
        description: "The default agent. Executes tools based on configured permissions.",
        options: {},
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_enter: "allow",
          }),
          user,
        ),
        mode: "primary",
        native: true,
      },
      plan: {
        name: "plan",
        description: "Plan mode. Disallows all edit tools.",
        options: {},
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_exit: "allow",
            external_directory: {
              [path.join(Global.Path.data, "plans", "*")]: "allow",
            },
            edit: {
              "*": "deny",
              [path.join(".opencode", "plans", "*.md")]: "allow",
              [path.relative(Instance.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
            },
          }),
          user,
        ),
        mode: "primary",
        native: true,
      },
      general: {
        name: "general",
        description: `General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.`,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            todoread: "deny",
            todowrite: "deny",
          }),
          user,
        ),
        options: {},
        mode: "subagent",
        native: true,
      },
      explore: {
        name: "explore",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            grep: "allow",
            glob: "allow",
            list: "allow",
            bash: "allow",
            webfetch: "allow",
            websearch: "allow",
            codesearch: "allow",
            read: "allow",
            external_directory: {
              "*": "ask",
              ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
            },
          }),
          user,
        ),
        description: `Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.`,
        prompt: PERSONA_EXPLORE,
        options: {},
        mode: "subagent",
        native: true,
      },
      compaction: {
        name: "compaction",
        mode: "primary",
        native: true,
        hidden: true,
        prompt: PERSONA_COMPACTION,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
          }),
          user,
        ),
        options: {},
      },
      title: {
        name: "title",
        mode: "primary",
        options: {},
        native: true,
        hidden: true,
        temperature: 0.5,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
          }),
          user,
        ),
        prompt: PERSONA_TITLE,
      },
      summary: {
        name: "summary",
        mode: "primary",
        options: {},
        native: true,
        hidden: true,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
          }),
          user,
        ),
        prompt: PERSONA_SUMMARY,
      },
    }

    for (const [key, value] of Object.entries(cfg.agent ?? {})) {
      if (value.disable) {
        delete result[key]
        continue
      }
      let item = result[key]
      if (!item)
        item = result[key] = {
          name: key,
          mode: "all",
          permission: PermissionNext.merge(defaults, user),
          options: {},
          native: false,
        }
      if (value.model) item.model = Provider.parseModel(value.model)
      item.variant = value.variant ?? item.variant
      item.prompt = value.prompt ?? item.prompt
      item.description = value.description ?? item.description
      item.temperature = value.temperature ?? item.temperature
      item.topP = value.top_p ?? item.topP
      item.mode = value.mode ?? item.mode
      item.color = value.color ?? item.color
      item.hidden = value.hidden ?? item.hidden
      item.name = value.name ?? item.name
      item.steps = value.steps ?? item.steps
      item.options = mergeDeep(item.options, value.options ?? {})
      item.permission = PermissionNext.merge(item.permission, PermissionNext.fromConfig(value.permission ?? {}))
    }

    // Ensure Truncate.GLOB is allowed unless explicitly configured
    for (const name in result) {
      const agent = result[name]
      const explicit = agent.permission.some((r) => {
        if (r.permission !== "external_directory") return false
        if (r.action !== "deny") return false
        return r.pattern === Truncate.GLOB
      })
      if (explicit) continue

      result[name].permission = PermissionNext.merge(
        result[name].permission,
        PermissionNext.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
      )
    }

    return result
  })

  // ── Seed defaults for first run ───────────────────────────────────────────
  //
  // Seeds the 4 visible non-hidden agents into .opendora/agents/ so they are
  // immediately manageable via the UI. Hidden internal agents (compaction,
  // title, summary) are brought in separately once the UI supports them.

  async function seedIfFirstRun(): Promise<void> {
    if (!(await AgentFile.isFirstRun())) return
    const seeds: Array<{ id: string; config: AgentFile.Config; persona: string }> = [
      {
        id: "build",
        config: {
          name: "build",
          description: "The default agent. Executes tools based on configured permissions.",
          mode: "primary",
          // all tools available — permissions control what is allowed/denied
          tools: ["bash", "read", "glob", "grep", "edit", "write", "task", "webfetch", "todowrite", "websearch", "codesearch", "apply_patch", "question"],
        },
        persona: PERSONA_BUILD,
      },
      {
        id: "plan",
        config: {
          name: "plan",
          description: "Plan mode. Disallows all edit tools.",
          mode: "primary",
          // read-only — edit/write denied by permission layer
          tools: ["bash", "read", "glob", "grep", "task", "webfetch", "websearch", "codesearch", "question"],
        },
        persona: PERSONA_PLAN,
      },
      {
        id: "general",
        config: {
          name: "general",
          description:
            "General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.",
          mode: "subagent",
          // no todo tools
          tools: ["bash", "read", "glob", "grep", "edit", "write", "task", "webfetch", "websearch", "codesearch", "apply_patch"],
        },
        persona: PERSONA_GENERAL,
      },
      {
        id: "explore",
        config: {
          name: "explore",
          description:
            "Fast agent specialized for exploring codebases. Use when you need to quickly find files by patterns, search code for keywords, or answer questions about the codebase.",
          mode: "subagent",
          // read-only exploration tools only
          tools: ["grep", "glob", "read", "bash", "webfetch", "websearch", "codesearch"],
        },
        persona: PERSONA_EXPLORE,
      },
      {
        id: "compaction",
        config: {
          name: "compaction",
          description: "Compacts conversation history to reduce token usage.",
          mode: "primary",
          hidden: true,
          tools: [],
        },
        persona: PERSONA_COMPACTION,
      },
      {
        id: "title",
        config: {
          name: "title",
          description: "Generates a short title for a session.",
          mode: "primary",
          hidden: true,
          tools: [],
        },
        persona: PERSONA_TITLE,
      },
      {
        id: "summary",
        config: {
          name: "summary",
          description: "Summarises a session.",
          mode: "primary",
          hidden: true,
          tools: [],
        },
        persona: PERSONA_SUMMARY,
      },
    ]
    for (const seed of seeds) {
      await AgentFile.create(seed.id, seed.config, seed.persona).catch(() => {})
    }
  }

  // ── merged() — combines cached natives + always-fresh file agents ─────────
  //
  // Native agents come from Instance.state (cached for performance).
  // File agents are re-read from disk on every call so create/update/delete
  // are immediately visible without any state invalidation.
  //
  // Merge rule: file agent fields (name, description, persona, model,
  // temperature, color, hidden) overlay the matching native agent's defaults.
  // Permission logic always stays in code.

  async function merged(): Promise<Record<string, Info>> {
    await seedIfFirstRun()

    const [natives, fileAgents] = await Promise.all([state(), AgentFile.loadAll()])

    const result: Record<string, Info> = { ...natives }

    // Build default permissions once — used for any net-new file-only agents
    let _fileDefaults: PermissionNext.Ruleset | undefined
    async function fileDefaults(): Promise<PermissionNext.Ruleset> {
      if (_fileDefaults) return _fileDefaults
      const cfg = await Config.get()
      const skillDirs = await Skill.dirs()
      const whitelistedDirs = [Truncate.GLOB, ...skillDirs.map((dir) => path.join(dir, "*"))]
      _fileDefaults = PermissionNext.merge(
        PermissionNext.fromConfig({
          "*": "allow",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          question: "deny",
          plan_enter: "deny",
          plan_exit: "deny",
        }),
        PermissionNext.fromConfig(cfg.permission ?? {}),
        PermissionNext.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
      )
      return _fileDefaults
    }

    for (const fa of fileAgents) {
      const existing = result[fa.id]
      if (existing) {
        // Overlay editable fields from file onto native defaults
        existing.name = fa.config.name ?? existing.name
        existing.description = fa.config.description ?? existing.description
        if (fa.persona) existing.prompt = fa.persona
        if (fa.config.model) existing.model = fa.config.model
        if (fa.config.temperature !== undefined) existing.temperature = fa.config.temperature
        if (fa.config.steps !== undefined) existing.steps = fa.config.steps
        if (fa.config.color) existing.color = fa.config.color
        if (fa.config.hidden !== undefined) existing.hidden = fa.config.hidden
        if (fa.config.tools !== undefined) existing.tools = fa.config.tools
      } else {
        // Net-new file-only agent — add with default permissions
        result[fa.id] = {
          name: fa.config.name,
          description: fa.config.description,
          mode: fa.config.mode ?? "all",
          native: false,
          hidden: fa.config.hidden,
          model: fa.config.model,
          temperature: fa.config.temperature,
          steps: fa.config.steps,
          color: fa.config.color,
          tools: fa.config.tools,
          prompt: fa.persona || undefined,
          permission: await fileDefaults(),
          options: {},
        }
      }
    }

    return result
  }

  // ── Public read API ───────────────────────────────────────────────────────

  export async function get(agent: string): Promise<Info | undefined> {
    return merged().then((x) => x[agent])
  }

  export async function list(): Promise<Info[]> {
    const cfg = await Config.get()
    return pipe(
      await merged(),
      values(),
      sortBy([(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"]),
    )
  }

  export async function defaultAgent(): Promise<string> {
    const cfg = await Config.get()
    const agents = await merged()

    if (cfg.default_agent) {
      const agent = agents[cfg.default_agent]
      if (!agent) throw new Error(`default agent "${cfg.default_agent}" not found`)
      if (agent.mode === "subagent") throw new Error(`default agent "${cfg.default_agent}" is a subagent`)
      if (agent.hidden === true) throw new Error(`default agent "${cfg.default_agent}" is hidden`)
      return agent.name
    }

    const primaryVisible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
    if (!primaryVisible) throw new Error("no primary visible agent found")
    return primaryVisible.name
  }

  // ── File-based CRUD ───────────────────────────────────────────────────────
  //
  // These write to .opendora/agents/ via AgentFile (security model enforced
  // there). Next call to list() / get() picks up the change immediately
  // because merged() always reads file agents fresh.

  /** Create a new agent in .opendora/agents/<id>/. */
  export async function create(id: string, config: AgentFile.Config, persona = ""): Promise<AgentFile.Entry> {
    const safeId = AgentFile.toId(id)
    if (await AgentFile.exists(safeId)) throw new Error(`agent "${safeId}" already exists`)
    return AgentFile.create(safeId, config, persona)
  }

  /** Update an existing file-based agent. Pass persona to also update persona.md. */
  export async function update(id: string, patch: Partial<AgentFile.Config>, persona?: string): Promise<AgentFile.Entry> {
    if (!(await AgentFile.exists(id))) throw new Error(`agent "${id}" not found in .opendora/agents/`)
    return AgentFile.update(id, patch, persona)
  }

  /** Remove an agent's .opendora/agents/<id>/ directory and its index entry. */
  export async function remove(id: string): Promise<void> {
    return AgentFile.remove(id)
  }

  /** Get the raw persona.md content for an agent. */
  export async function getPersona(id: string): Promise<string> {
    return AgentFile.getPersona(id)
  }

  /** Overwrite persona.md for an agent. */
  export async function setPersona(id: string, text: string): Promise<void> {
    if (!(await AgentFile.exists(id))) throw new Error(`agent "${id}" not found in .opendora/agents/`)
    return AgentFile.setPersona(id, text)
  }

  // ── AI generation ─────────────────────────────────────────────────────────

  export async function generate(input: { description: string; model?: { providerID: string; modelID: string } }) {
    const cfg = await Config.get()
    const defaultModel = input.model ?? (await Provider.defaultModel())
    const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
    const language = await Provider.getLanguage(model)

    const system = [PROMPT_GENERATE]
    await Plugin.trigger("experimental.chat.system.transform", { model }, { system })
    const existing = await list()

    const params = {
      experimental_telemetry: {
        isEnabled: cfg.experimental?.openTelemetry,
        metadata: {
          userId: cfg.username ?? "unknown",
        },
      },
      temperature: 0.3,
      messages: [
        ...system.map(
          (item): ModelMessage => ({
            role: "system",
            content: item,
          }),
        ),
        {
          role: "user",
          content: `Create an agent configuration based on this request: \"${input.description}\".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
        },
      ],
      model: language,
      schema: z.object({
        identifier: z.string(),
        whenToUse: z.string(),
        systemPrompt: z.string(),
      }),
    } satisfies Parameters<typeof generateObject>[0]

    if (defaultModel.providerID === "openai" && (await Auth.get(defaultModel.providerID))?.type === "oauth") {
      const result = streamObject({
        ...params,
        providerOptions: ProviderTransform.providerOptions(model, {
          instructions: SystemPrompt.instructions(),
          store: false,
        }),
        onError: () => {},
      })
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error
      }
      return result.object
    }

    const result = await generateObject(params)
    return result.object
  }
}
