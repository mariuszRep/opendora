---
name: agent-author
description: Templates and guidance for writing high-quality agent personas, injections, and configurations. Load this when creating or rewriting agents from scratch.
---

# Agent Authoring Skill

Use this skill when creating a new agent or doing a full rewrite of an existing one.

## No-Regression Rule

- Preserve important existing behavior unless the prompt explicitly requires changing it
- Prefer additive edits over replacing or deleting established guidance
- Before changing current behavior, identify what is changing, why it must change, and how it will be validated
- Keep a visible comparison between the previous state and the proposed state so behavior drift is easy to spot

## Variables

- `{{agent_id}}` — the agent's filesystem ID (e.g. `project-owner`)
- `{{agent_name}}` — human-readable name (e.g. `Project Owner`)
- `{{agent_role}}` — one-line description of what the agent owns
- `{{agent_mode}}` — `primary` (user-facing) or `worker` (delegated-to only)

---

## PERSONA.md Template

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

## INJECTION.md Template

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

## Prompt Assembly Order

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

## agent.json Template

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

## Tool Selection Guide

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

## Quality Checklist

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

## Steps

1. Gather: what does this agent own? What decisions does it make? What tools will it call?
2. If the agent already exists, read the current state and list the behavior that must be preserved
3. Draft PERSONA.md using the template — focus on identity and capabilities
4. Draft INJECTION.md if the agent needs runtime context (most workers don't)
5. Set agent.json — start with minimal tools, correct mode and steps budget
6. Run `agent_create` or `agent_update` with all three
7. Test with a representative task — observe step count and tool usage
8. Adjust steps budget and tools based on observed behaviour
