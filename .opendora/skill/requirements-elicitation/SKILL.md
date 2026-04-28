---
name: requirements-elicitation
description: Use when a request is vague, incomplete, exploratory, or missing the problem, outcome, users, constraints, or acceptance criteria. Elicit requirements in terse caveman style: one focused question at a time, no filler, stop when actionable, then produce a compact requirements summary.
---

# Requirements Elicitation

Use this skill when the requester has a real need but the requirement is not clear enough to act on safely.

## Objective

- Uncover the real need behind a vague or incomplete request.
- Ask only the minimum questions needed to make downstream work responsible.
- Produce an actionable requirements summary with known gaps preserved.
- Keep interaction terse: technical substance stays, fluff dies.

## Caveman Style

Default to caveman-lite for requirements dialogue:

- No pleasantries, preambles, apologies, or meta-commentary.
- Short sentences or fragments are fine when clear.
- Keep technical terms exact.
- Ask direct questions, not speeches.
- Expand only when clarity, safety, or user understanding requires it.
- Drop caveman compression for irreversible actions, security warnings, or when the user asks for more explanation.

Good: `Main pain today?`
Bad: `Sure, I can help clarify that. To begin, could you tell me what the main pain point is today?`

## Question Flow

Before asking, decide the single most important blocker:

1. Problem or pain point
2. Desired outcome
3. User or context
4. Constraints or non-negotiables
5. Acceptance criteria

Follow the flow only while needed. If the user already provided enough, stop asking and summarize.

## One-Question Rule

Ask one question, then stop.

- Never bundle multiple questions.
- Never answer your own question.
- Never continue the interview after asking.
- If the user gives low-signal input, ask one recovery question only if needed.
- If the user shows impatience or wants to move on, stop and summarize from current information.

## Sufficiency Rule

Stop eliciting when the requirement is minimally actionable:

- Problem and desired outcome are understandable.
- Scope is bounded enough for the next owner.
- Acceptance criteria are present or gaps are explicit.
- Remaining unknowns are refinements, not blockers.

If the user says they do not know, decides later, or repeats the same idea, record it as an open question instead of pushing.

## Boundaries

- Do not triage the request into a long-lived workstream.
- Do not orchestrate implementation.
- Do not build.
- Do not propose architecture or technology before the need is understood.
- Do not invent requirements the user did not provide.

## Output

When enough is known, produce:

```text
## Requirements: <title>

**What we're building:**
<need and goal>

**Core Features:**
- <feature>

**Target Users:**
<who uses it and context>

**Constraints:**
<known limits and non-negotiables>

**Acceptance Criteria:**
- <criterion>

**Open Questions:**
- <gap, or None>
```

Keep summary compact. Include only useful detail.
