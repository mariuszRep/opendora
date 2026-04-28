# MIGRATION.md — packages/session

> **Owner: agent** — updated as migration work starts, completes, or gets blocked.
> Read `/VISION.md` (repo root) first. This file covers the session package only.

---

## Planned: Single system prompt

### Why

The system prompt is currently assembled in three separate places with duplicated logic:

- `src/system.ts` — `SystemPrompt.environment()`, `SystemPrompt.provider()` (per-model variants)
- `src/prompt.ts` — `SessionPrompt.loop()` builds `system[]` inline (env + instruction files + skills block)
- `src/llm.ts` — `LLM.stream()` merges `system[]` with persona + toolNotice + delegateNotice inline

This means a fourth consumer (e.g. the REST endpoint `GET /session/:id/system-prompt`) has to duplicate the logic again and still can't get it exactly right because the runtime tool set is only known inside `LLM.stream()`.

The per-model prompt variants (`anthropic.txt`, `gemini.txt`, `qwen.txt`, etc.) exist because different providers respond differently to the same instructions. The goal is a single prompt that works across all models, eliminating the branch.

### Target

One exported function:

```ts
// packages/session/src/system.ts (or a new prompt-builder.ts)
export async function buildSystemPrompt(input: {
  agent: Agent.Info
  sessionID: string
  tools: string[]          // actual filtered tool IDs
  allowedAgents?: string[] // for delegation restriction, if applicable
}): Promise<string[]>
```

This function contains everything currently inline in `prompt.ts` and `llm.ts`:
- Environment block
- Instruction files (CLAUDE.md, AGENTS.md)
- Skills block
- Tool restriction notice
- Delegation restriction notice

`LLM.stream()` calls it instead of building inline. The REST endpoint calls it too — exact same output.

### Steps

- [ ] Write a single `prompt/base.txt` to replace all per-model variants
- [ ] Extract `buildSystemPrompt()` from the inline logic in `prompt.ts` + `llm.ts`
- [ ] Update `LLM.stream()` to call `buildSystemPrompt()` — delete inline assembly
- [ ] Update `GET /session/:id/system-prompt` to call `buildSystemPrompt()` — delete duplicated logic
- [ ] Delete `src/prompt/anthropic.txt`, `gemini.txt`, `qwen.txt`, `beast.txt`, `trinity.txt`, `codex_header.txt`
- [ ] Remove `isCodex` branch and `SystemPrompt.provider()` entirely
