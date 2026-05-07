---
name: delivery-synthesis
description: Load after context, research, or architecture phases to convert findings and session refs into a concrete implementation plan before any code edits.
origin: opendora
---

# Delivery Synthesis

Use this skill after context, research, or architecture analysis and before implementation.

## Objective

- Convert findings into an implementation-ready spec.
- Keep root Product Engineer responsible for understanding and decisions.
- Prevent vague handoffs such as "use the findings to fix it".

## Inputs

- Intake contract
- Project context summary
- Research findings and session ids
- Architecture recommendations, if any
- Acceptance criteria and constraints

## Steps

1. Review only the durable phase summaries first.
2. Inspect referenced sessions only when summaries are insufficient for a decision.
3. Identify the smallest change that satisfies acceptance criteria.
4. Define affected files, interfaces, commands, and verification route.
5. Resolve contradictions between findings, repo conventions, and requirements.
6. Stop for one focused question if a missing decision materially changes the implementation.
7. Produce the implementation spec.

## Output Contract

```text
## Implementation Spec

Goal: ...
Non-Goals: ...
Approach: ...
Files To Change:
- `path`: exact change
Interfaces/Contracts: ...
Data/State Effects: ...
Error/Edge Cases: ...
Verification Plan:
- build/typecheck/lint/tests/runtime probes
Risks: ...
Source Sessions: [session ids or none]
Status: READY | BLOCKED
```

## Rules

- Do not edit files in this phase.
- Use concrete file paths and symbols; avoid abstract implementation advice.
- Prefer existing patterns and dependencies.
- Keep the implementation plan small enough to verify.
- Never outsource synthesis to another phase or session.