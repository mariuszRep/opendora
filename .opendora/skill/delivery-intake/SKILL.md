---
name: delivery-intake
description: Load at the start of any Product Engineer software task to classify scope, risk, readiness, required workflow skills, and whether isolated phase sessions are needed before implementation.
origin: opendora
---

# Delivery Intake

Use this skill as the first callable prompt module for Product Engineer software delivery.

## Objective

- Convert the user request into a safe, executable delivery route.
- Decide whether requirements are ready, what skills must be loaded, and which workflow phases need isolated sessions.
- Prevent premature implementation when scope, safety, or ownership is unclear.

## Inputs

- User request
- Current session context
- Available skill list
- Known project path or repository target, if provided

## Steps

1. Re-verify ownership, skill options, and tool path before any major decision.
2. Run a broad skill scan at intake-phase start (or at start of a new isolated session), not every turn.
3. Build the minimal candidate load list first; if available skills have credible upside, load once in deterministic order before acting.
4. Enforce hard dedup: never call `skill_load` for a skill already loaded in the current session unless skill version/context changed or you are entering a new isolated session.
5. While executing inside intake phase, do not rescan/reload unless blocked by a missing capability required to continue.
6. Extract objective, constraints, acceptance signals, risks, blockers, and likely project area.
7. Classify complexity:
   - `simple`: localized, low-risk, clear verification path.
   - `medium`: multi-file/module, moderate ambiguity, non-trivial tests, or meaningful UX/API behavior. A new API endpoint is `medium` unless it is a tiny copy of an existing route with no new behavior.
   - `hard`: cross-cutting, architecture-sensitive, high-risk, external-impact, or phased work.
   - Use only these labels: `simple`, `medium`, `hard`.
8. Decide readiness:
   - Ready when implementation path can be inferred from repository context or explicit requirements.
   - Not ready when a decision materially changes architecture, data/security posture, product behavior, or external impact.
9. Decide phase isolation:
   - Keep in root session for short, low-noise, directly actionable tasks.
   - Use isolated sessions for open-ended research, architecture review, noisy verification, or independent second opinions.
10. Produce the intake contract for the next phase.

## Output Contract

```text
## Intake Contract

Objective: ...
Constraints: ...
Acceptance Signals: ...
Risks: ...
Complexity: simple | medium | hard
Ready: true | false
Missing Blockers: ...
Workflow Skills: [ordered skills; include project-context before code exploration and delivery-report for final handback unless blocked]
Isolated Sessions: [phase -> reason, or none]
Next Phase: context | requirements | research | synthesis | implementation | blocked
```

## Rules

- Ask exactly one focused question only when the missing decision blocks safe execution and cannot be inferred.
- Do not ask for permission to proceed when the next safe step is context, research, or implementation.
- Keep execution local for ecosystem-owned artifacts.
- Delegate only when outside scope, authority/tools are unavailable locally, or a local blocker has been proven.
- Do not delegate by habit or speed.
- When blocked, state the exact blocker and why local resolution is not possible.
- Include `delivery-report` in the workflow unless the task is blocked before delivery.
