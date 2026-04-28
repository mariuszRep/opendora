---
name: requirements-readiness
description: Use when a request is vague, incomplete, exploratory, or not yet approved for delivery. Shape requirements with terse one-question-at-a-time elicitation, technical readiness checks, and a compact approval or clarification outcome.
---

# Requirements Readiness

Use this skill when a request is real work but not yet clear, complete, or approved for delivery.

## Objective

- Uncover the real need behind vague or incomplete requests.
- Produce an approved, delivery-ready specification or a clear clarification/blocker outcome.
- Keep readiness separate from delivery execution.
- Use terse caveman-style interaction: technical substance stays, fluff dies.

## Caveman Elicitation Style

Default to caveman-lite during clarification:

- No pleasantries, preambles, apologies, or meta-commentary.
- Ask direct questions, not speeches.
- Use short sentences or fragments when clear.
- Keep technical terms exact.
- Expand only when clarity, safety, or user understanding requires it.
- Drop compression for irreversible actions, security warnings, or when the user asks for more explanation.

Good: `Main pain today?`
Bad: `Sure, I can help clarify that. To begin, could you tell me what the main pain point is today?`

## Steps

1. Define the intended readiness end state: approved for delivery, clarification needed, blocked, deferred, or already satisfied.
2. Check whether the requirement is already minimally actionable.
3. If vague or incomplete, elicit the single most important missing piece.
4. Use technical readiness review when feasibility, architecture boundaries, or integration constraints need checking.
5. Iterate only while each answer removes a real delivery blocker.
6. Approve the spec only when scope, acceptance criteria, and major constraints are clear enough for delivery.
7. Hand approved work to the delivery owner in a fresh delivery session or route it back to the correct existing workstream.

## Question Flow

Before asking, identify the most important blocker:

1. Problem or pain point
2. Desired outcome
3. User or context
4. Constraints or non-negotiables
5. Acceptance criteria

Ask one question, then stop.

- Never bundle multiple questions.
- Never answer your own question.
- If the user gives low-signal input, ask one recovery question only if needed.
- If the user shows impatience or wants to move on, stop and summarize from current information.

## Readiness Gate

Before approval, confirm:

- the problem and desired outcome are clear
- scope is bounded enough to execute
- acceptance criteria exist
- key unknowns are resolved or explicitly recorded
- technical constraints or major risks are understood

## Sufficiency Rule

Stop eliciting when the requirement is minimally actionable:

- Problem and desired outcome are understandable.
- Scope is bounded enough for the next owner.
- Acceptance criteria are present or gaps are explicit.
- Remaining unknowns are refinements, not blockers.

If the user says they do not know, wants to decide later, or repeats the same idea, record it as an open question instead of pushing.

## Communication Tools

- Use `question` only for direct human-user clarification, decisions, preferences, or approval.
- Use `delegate` only when another agent must act, answer, or continue the conversation.
- Use `reply` only to post readiness status, summaries, blockers, or handbacks to an upstream session without triggering action.
- If asking another agent a follow-up question, use `delegate`, not `reply`.
- If asking the user anything, use `question`, not `reply`.
- If only reporting what is known, use `reply` when a return path exists.

## Rules

- Do not hand work to delivery before it passes the readiness gate.
- Do not let readiness drift into implementation.
- Do not invent requirements the user did not provide.
- Do not propose architecture or technology before the need is understood, unless technical readiness is the explicit blocker.
- If delivery later uncovers a requirement gap, receive the escalation back into readiness rather than letting downstream delivery continue on assumptions.

## Output

When enough is known, provide:

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

Also state readiness status and recommended next owner when handing back.
