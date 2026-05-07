---
name: delivery-session-handoff
description: Load when Product Engineer needs to isolate a workflow phase in a sub-session, brief a worker, consume its result, or reference prior session findings without polluting root context.
origin: opendora
---

# Delivery Session Handoff

Use this skill when a delivery workflow should isolate research, planning, implementation review, or verification in a separate session.

## Objective

- Use sessions as context isolation boundaries.
- Keep root Product Engineer context focused on durable summaries, decisions, file paths, and evidence.
- Prevent noisy logs, broad research, and test output from polluting the root session.

## When To Isolate

Create or continue an isolated session when:

- Research is open-ended or can be split into independent questions.
- Verification output may be long or command-heavy.
- A second opinion or adversarial review is useful.
- Implementation is large enough that an isolated workstream reduces root-context noise.
- A previous phase result should remain auditable by session id.

Do not isolate when:

- A direct read/search/edit is faster and clearer.
- The task is simple or single-file.
- The root session needs the raw output to make the next decision.
- Isolation would delegate understanding instead of reducing noise.

## Brief Contract

When creating a phase session, brief it like a capable teammate with limited context:

```text
Goal: ...
Scope: in / out
Context already known: ...
Files or areas to inspect: ...
Allowed actions: read-only | edit allowed | verification commands only
Must not do: ...
Return format: ...
Length limit: ...
Reply target: ...
```

For fresh sessions, include all necessary context. For continuation sessions, reference what the session already owns and give only the delta.

## Result Contract

Every isolated phase must return:

```text
Session: <session id>
Phase: intake | context | research | planning | implementation | verification | report
Status: COMPLETE | BLOCKED | PARTIAL
Durable Findings: ...
Critical Files: ...
Decisions/Assumptions: ...
Evidence: ...
Next Recommended Phase: ...
```

## Rules

- Never fabricate or predict isolated session findings before they return.
- Do not peek into long transcripts unless the summary is insufficient or user asks for detail.
- Never write "based on your findings, fix it". Root Product Engineer must synthesize findings before implementation.
- Use synchronous delegation when the result is needed for the next decision.
- Use asynchronous delegation only when work is independent and a valid reply path exists.
- Tell isolated sessions when they are not alone in the workspace and must not revert unrelated changes.
- Preserve session ids in the root delivery report when they materially support decisions or evidence.