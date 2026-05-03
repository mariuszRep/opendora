---
name: agent-ops
description: Required lane for all agent work: personas, injections, configs, routing rules, and agent eval/experiments. Do not use for skill content or tool metadata changes.
origin: opendora
---

# Agent Operations Skill

Use this skill for creating new agents, managing existing agents, running improvement experiments, and handling all agent lifecycle tasks.

## This Skill Combines

- **Agent Authoring** — templates and guidance for writing high-quality agent personas, injections, and configurations
- **Agent Experimentation** — running targeted improvement experiments on agents (baseline, apply one change, measure delta, keep or discard)
- **Agent Management** — creating, updating, listing, getting, and deleting agents

## Alias Triggers

This skill responds to:
- "agent operations"
- "agent management"
- "agent-author"
- "agent-experiment"
- "create a new agent"
- "update an agent"
- "run an experiment on agent"

---

## Part 1: Agent Authoring

Use this when creating a new agent or doing a full rewrite of an existing agent.

### No-Regression Rule

- Preserve important existing behavior unless the prompt explicitly requires changing it
- Prefer additive edits over replacing or deleting established guidance
- Before changing current behavior, identify what is changing, why it must change, and how it will be validated
- Keep a visible comparison between the previous state and the proposed state so behavior drift is easy to spot

### Variables

- `{{agent_id}}` — the agent's filesystem ID (e.g. `project-owner`)
- `{{agent_name}}` — human-readable name (e.g. `Project Owner`)
- `{{agent_role}}` — one-line description of what the agent owns
- `{{agent_mode}}` — `primary` (user-facing) or `worker` (delegated-to only)

---

### PERSONA.md Template

```markdown
# {{agent_name}}

You are {{agent_name}}. {{agent_role}}.

## What You Own

- [List the domains, decisions, and responsibilities this agent holds]
- [Keep to 4–7 items — if it's longer, the role is too broad]

## What You Can Do

- **[Capability]** — [short description]
- **[Capability]** — [short description]
- [Verbs: know, create, update, analyse, advise, coordinate, review, execute]

## How You Work

- [One key behaviour rule]
- [One key decision rule]
- One step at a time — make one tool call, process result, decide next
- Track progress with todowrite for tasks with more than 3 steps

## Rules

- [Any hard constraints — things this agent must or must never do]
- Never name specific agents, tools, or skills — use capability descriptions
- Delegate to specialists rather than doing everything yourself
```

---

### INJECTION.md Template

Use injection for **runtime context only** — data the agent needs that changes per session.

```markdown
## Available Specialists

The following agents are available for delegation:
{{delegate_agents}}

## Current Context

[Any session-specific constraints or state the agent needs at startup]
```

**Injection rules:**
- Do not put personality or behaviour here — that's PERSONA
- Do not hardcode agent names — use `{{delegate_agents}}` which is populated at runtime
- Keep it short — injection is prepended to every message

### Prompt Assembly Order

When assembling or reviewing an agent prompt, preserve this order unless there is a strong, validated reason to change it:

1. Base config
2. Persona
3. Skills
4. Tools
5. Injection

**Ordering rules:**
- Keep persona before skills and tools so identity, scope, and decision rules are established first
- Keep skills before tools when skills are meant to shape workflow before raw capabilities are listed
- Keep tools as explicit inventory, not hidden inside persona text
- Keep injection last and runtime-only so current context does not overwrite core identity

---

### agent.json Template

```json
{
  "name": "{{agent_name}}",
  "description": "One sentence: what this agent does and when to use it",
  "mode": "worker",
  "model": {
    "modelID": "minimax-m2.5-free",
    "providerID": "opencode"
  },
  "temperature": 0.3,
  "steps": 30,
  "color": "blue",
  "tools": [
    "read",
    "delegate",
    "reply",
    "todowrite"
  ],
  "skills": []
}
```

**Config guidance:**
- `mode`: `primary` for user-facing entry points, `worker` for specialist agents
- `temperature`: 0.1–0.3 for precise/structured work, 0.5–0.8 for creative/advisory work
- `steps`: match to task complexity — simple workers: 20–30, orchestrators: 60–100
- `tools`: start minimal, add only what the agent demonstrably needs
- `skills`: only skills this agent will actually use — empty is fine

---

### Tool Selection Guide

| Need | Tool |
|------|------|
| Read files | `read` |
| Write/create files | `write`, `edit` |
| Delegate to specialist | `delegate` |
| Search past sessions | `session_search` |
| Inspect a session | `session_get` |
| Reply to parent | `reply` |
| Track tasks | `todowrite` |
| Manage agents | `agent_create`, `agent_update`, `agent_list`, `agent_get`, `agent_delete` |
| Load a skill | `skill_load`, `skill_discover` |
| Log problems | `log` |

Only include tools the agent will call in normal operation. Fewer tools = less noise in the system prompt.

---

### Quality Checklist

Before saving any agent:

- [ ] PERSONA describes identity and capabilities — not procedures or step-by-step instructions
- [ ] No agent names, tool names, or skill names hardcoded in PERSONA or INJECTION
- [ ] INJECTION contains only runtime-variable content
- [ ] Tools list is the minimum needed
- [ ] Skills list contains only skills the agent will use
- [ ] Steps budget is reasonable for the expected task complexity
- [ ] Mode is correct: `primary` or `worker`
- [ ] Description is one clear sentence explaining when to use this agent
- [ ] Important existing behavior is preserved unless a deliberate change is documented
- [ ] Any prompt-order change is intentional, justified, and validated
- [ ] A representative task is used to validate the updated agent before treating the rewrite as final

---

## Part 2: Agent Experimentation

Use this when running one targeted improvement experiment on an agent.

This skill is driven by a **campaign brief** — read it carefully before starting. The brief defines the target, the goal, and optionally the scope and test approach.

### Campaign Variables

The session prompt will give you:

- **target** — agent ID to improve (e.g. `pandora`, `pm`, `agent-owner`)
- **goal** — what behaviour to improve (e.g. "always delegates by intent, not by name", "avoids redundant reads before acting")
- **scope** — what artifact to change: `persona`, `injection`, `tools`, `skills`, or `auto` (detect from goal)
- **test_mode** — how to test: `questions` (short Q&A probes), `workflow` (full end-to-end task session), or `auto` (infer from goal)
- **test_brief** — description of what a successful run looks like (optional; derive if not given)

If `target` or `goal` is missing, ask before proceeding. All other variables can be inferred.

---

### Experiment ID

Generate a short ID at the start: `exp-{target}-{YYYYMMDD}-{N}` (increment N if running multiple today).
Use this ID to label every sub-session spawned during this experiment.

---

### Experiment Steps

1. **Read current state**
   - `agent_get` the target agent config
   - `read` its `PERSONA.md`
   - `read` its `INJECTION.md` if `enableInjection: true`
   - `read` `.opendora/skill/agent-ops/log.md` if it exists — use past entries as context to avoid repeating known failures
   - Note the full current state before making any changes

2. **Determine test scenario**
   - If `test_mode` is `questions` or the goal is about delegation routing, decision behaviour, or short-form correctness:
     - Derive 5 short test prompts that directly probe the goal
     - Write them out in full before starting — they must be identical for baseline and post-change runs
   - If `test_mode` is `workflow` or the goal is about multi-step behaviour, efficiency, end-to-end quality, or tool usage patterns:
     - Design one representative task that exercises the full capability being improved
     - Describe the task explicitly — what the agent should do, what a correct outcome looks like

3. **Run baseline**
   - For each test question or the workflow task:
     - `delegate` to the target agent in a fresh sub-session
     - Label each session: `{experiment_id}/baseline/{n}`
     - After the session completes, use `session_get` to retrieve token data
   - Record all baseline results as a table

4. **Baseline assessment**
   - Summarise the behaviour pattern
   - Specific failure or inefficiency (if any)
   - Whether baseline is already at 100% correct — if so, state it and stop

5. **Propose one change**
   - Exactly **which artifact** to change
   - One targeted change that is:
     - Expressed as a behavioural rule or capability statement — never an agent name
     - Minimal — prefer adding one sentence over rewriting a section
     - Not contradictory to other documented behaviours

6. **Apply the change**
   - Use `edit` for PERSONA.md or SKILL.md
   - Use `agent_update` for tools list

7. **Run post-change**
   - Exact same tests as baseline, fresh sub-sessions

8. **Compare**
   - Pass/fail delta
   - Token delta
   - Step delta

9. **Keep or discard**
   - **KEEP**: commit change, append to log
   - **DISCARD**: revert change, append to log

10. **Report**
    - Experiment ID, Target, Goal, Scope
    - Baseline/Post results, Delta
    - Decision and Reason

---

### Log Format

Append one entry per experiment to `.opendora/skill/agent-ops/log.md`:

```markdown
### {experiment_id} — {YYYY-MM-DD}

- **Target**: {agent_id}
- **Goal**: {goal}
- **Scope**: {persona | injection | tools | skills}
- **Change**: {what was changed}
- **Baseline**: {X/N} | {input tokens} in / {output tokens} out | {steps} steps
- **Post**: {X/N} | {input tokens} in / {output tokens} out | {steps} steps
- **Decision**: KEEP / DISCARD
- **Lesson**: {one sentence}
```

---

## Migration Notes

This skill (`agent-ops`) combines and replaces:
- `agent-author` (merged into Agent Authoring section)
- `agent-experiment` (merged into Agent Experimentation section)

Old skill directories are retained as compatibility aliases but all new work should reference this skill.
