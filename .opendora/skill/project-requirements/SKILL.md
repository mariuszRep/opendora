---
name: project-requirements
description: Use when a request is vague, incomplete, exploratory, or not yet approved for delivery. Shape requirements with terse one-question-at-a-time elicitation, technical readiness checks, and a compact approval or clarification outcome.
---

# Project Requirements

Use this skill when a request is real work but not yet clear, complete, or approved for delivery.

## Objective

- Uncover the real need behind vague or incomplete requests.
- Produce an approved, delivery-ready specification or a clear clarification/blocker outcome.
- Keep readiness separate from delivery execution.
- Use terse caveman-style interaction: technical substance stays, fluff dies.

## Elicitation Loop

### Core Pattern

1. Identify the single most important blocker
2. Ask one targeted question using `question` tool
3. Wait for reply—do not assume or answer your own question
4. Adapt next question based on the answer
5. Repeat until sufficient clarity or clear blocker emerges

### Question Strategy

Focus on removing the highest-impact unknown:

1. What problem are you solving? (pain point, goal)
2. What does success look like? (desired outcome, acceptance)
3. Who is this for? (user, context)
4. What constraints apply? (non-negotiables, limits)
5. What's out of scope? (boundaries)

Ask one at a time. Never bundle. Never answer your own question.

### Bias Reduction

- Do not assume intent—elicit it.
- Do not fill gaps with assumptions—ask.
- Do not push for answers the user doesn't have—record as open.
- Challenge your own interpretation: ask "Did I get that right?" before proceeding.

### Unknown Removal

- Track what is known vs. unknown.
- Unknowns that block delivery = continue eliciting.
- Unknowns that are refinements = note and proceed.
- If user says "I don't know" or "decide later", record as open question, not blocker.

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
## Readiness: <title>

**Goal:** <what we're building>

**Scope:** <bounded deliverable>

**Acceptance:** <key criteria>

**Constraints:** <known limits>

**Open Questions:** <gaps or None>

**Status:** ready | blocked | deferred
```

State readiness status and recommended next owner when handing back.