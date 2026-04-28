---
name: requirements-readiness
description: Coordinate requirement shaping and technical readiness until a spec is approved for delivery or returned for clarification.
---

# Requirements Readiness

Use this skill when a product request is real work but is not yet approved for delivery.

## Objective

- Produce an approved, delivery-ready specification.
- Keep readiness work separate from delivery execution.

## Steps

1. Define the intended end state for the readiness phase: approved for delivery, clarification needed, blocked, deferred, or already satisfied.
2. Use requirements elicitation when the request is vague, incomplete, or user details are missing.
3. Use technical readiness review when feasibility, architecture boundaries, or integration constraints need checking.
4. Iterate between requirements and technical readiness only as needed.
5. Approve the spec only when scope, acceptance criteria, and major constraints are clear enough for delivery.
6. Hand approved work to the delivery owner in a fresh delivery session or route it back to the correct existing workstream.

## Readiness Gate

Before approval, confirm:

- the problem and desired outcome are clear
- scope is bounded enough to execute
- acceptance criteria exist
- key unknowns are resolved or explicitly recorded
- technical constraints or major risks are understood

## Rules

- Do not hand work to delivery before it passes the readiness gate.
- Do not let readiness drift into implementation.
- Keep the readiness hub as the only coordinator for requirement shaping.
- If delivery later uncovers a requirement gap, receive the escalation back into readiness rather than letting downstream delivery continue on assumptions.

## Output

Provide:

- readiness status
- approved specification or outstanding gaps
- recommended next owner
