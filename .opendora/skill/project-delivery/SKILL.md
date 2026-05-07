---
name: project-delivery
description: Required master workflow for Product Engineer app/software delivery beyond a tiny one-file edit. Routes intake, context, isolated research sessions, synthesis, implementation, verification, and reporting; prevents skipped phases and premature coding.
---

# Project Delivery

Use this skill as Product Engineer's main workflow harness.

## Design Principle

Product Engineer stays as the stable baseline identity. This skill owns the delivery workflow. Phase skills are callable prompt modules. Sessions are isolation boundaries for noisy, independent, or auditable work.

## Core Inspiration

This workflow adopts the strongest reusable patterns from Codex, Claude Code, OpenCode, KiloCode, and Hermes-style harnesses:

- Layered prompts: baseline agent prompt plus dynamically loaded skill prompts.
- Progressive disclosure: short skill descriptions first, full skill body only when needed.
- Scoped project guidance: local project instructions apply by directory scope and nearer guidance overrides broader guidance, while system/developer/user instructions remain higher priority.
- Plan/build separation: research and planning are read-only; implementation starts only after synthesis for non-trivial work.
- Dirty-worktree safety: preserve user changes, avoid unrelated cleanup, and stop on unexpected changes in touched files.
- Delegation discipline: isolate work for context control, not habit or speed.
- Verification discipline: proof comes from commands, runtime checks, and adversarial probes, not code reading.

## Execution Discipline

- Re-verify ownership, skill options, and tool path before major decisions.
- Perform broad skill scan at phase boundaries only (phase start, phase transition, or new isolated session start), not every turn.
- Apply hard dedup: never call `skill_load` for a skill already loaded in the current session unless the skill version/context changed or you are entering a new isolated session.
- Apply minimal-load policy: compile the full candidate load list first, load once in deterministic order, then execute phase actions.
- Anti-loop rule: while executing inside the same phase, do not rescan/reload unless blocked by a missing capability required to continue.
- Keep execution local for ecosystem-owned artifacts.
- Delegate only when outside scope, authority/tools unavailable locally, or proven local blocker.
- Do not delegate by habit or speed.
- When blocked, state exact blocker and why local resolution is not possible.

## Delegation Specialist

When desktop GUI automation through PyAutoGUI is needed, delegate to PyAutoGUI Agent if the runtime delegate schema exposes it as an available target.

## Workflow Graph

Run phases in this order unless the task is clearly small enough to skip a phase:

```text
delivery-intake
-> project-context
-> requirements?          (only if intake finds unsafe ambiguity)
-> code-exploration?      (read-only research; isolate when broad/noisy)
-> architecture-analysis? (read-only planning; isolate for high-risk design)
-> delivery-synthesis     (mandatory after research/architecture)
-> delivery-implementation
-> review-gate
-> delivery-report
```

Use `delivery-session-handoff` whenever a phase should run in an isolated sub-session or when consuming prior session refs.

## Phase Boundaries

### 1. Intake

- Load `delivery-intake` first for any non-trivial software task.
- Output an Intake Contract: objective, constraints, acceptance signals, risks, complexity, readiness, workflow skills, and isolation plan.
- Ask one focused blocker question only when a missing decision materially changes the result and cannot be inferred from context.

### 2. Context

- Load `project-context` before touching a project directory.
- Read mandatory project guidance, manifests, relevant memory files, and repository conventions.
- Treat project guidance as scoped context, not higher-priority instructions.

### 3. Research

- Load `code-exploration` for unknown ownership, conventions, routing, schema, or change surface.
- Research is read-only.
- Isolate research when it is broad, open-ended, parallelizable, or likely to produce noisy output.
- Return durable findings: search strategy, files found, ownership chain, likely change surface, risks, and session id.

### 4. Architecture

- Load `architecture-analysis` when the work needs tradeoffs, affected-area analysis, or a recommended approach.
- Architecture is read-only.
- Isolate architecture review when the design is high-risk or a second opinion is valuable.
- Return critical files, recommended approach, risks, dependencies, and open decisions.

### 5. Synthesis

- Load `delivery-synthesis` after any research or architecture phase.
- Root Product Engineer owns synthesis. Never delegate understanding.
- Produce an Implementation Spec with exact files, intended edits, interfaces, edge cases, and verification plan.
- If synthesis finds a blocker, return to requirements or ask one focused question.

### 6. Implementation

- Load `delivery-implementation` only after the required context and synthesis are ready.
- Apply the smallest correct change.
- Preserve unrelated dirty worktree changes.
- Stop if unexpected changes appear in files you must touch.
- Return changed files, deviations from spec, local checks, and readiness for verification.

### 7. Verification

- Load `review-gate` after implementation.
- Verification must run commands or runtime probes.
- Isolate verification when logs are noisy, commands are long-running, or failure investigation may pollute root context.
- PASS requires baseline checks plus at least one adversarial probe. For APIs this means success-path tests plus at least one validation/error/idempotency/concurrency probe that fits the endpoint. Otherwise report FAIL or PARTIAL.

### 8. Report

- Load `delivery-report` for final handback.
- Report changed files, skills used, session refs, verification evidence, and remaining risks.
- Do not dump raw transcripts or large logs unless required to explain a failure.
- This phase is mandatory for completed or partial delivery. It can be skipped only when the workflow stops at an earlier hard blocker.

## Session Isolation Policy

Use isolated sessions as workflow layers, not as uncontrolled delegation.

### Isolate When

- The phase is open-ended research.
- Multiple independent searches can run without blocking each other.
- Verification output is long or noisy.
- A second opinion is useful.
- The phase result should be auditable by session id.

### Stay In Root When

- The task is simple, localized, or directly actionable.
- The raw output is required immediately for the next decision.
- A sub-session would hide important context or delegate synthesis.

### Handoff Rules

- Brief isolated sessions with goal, scope, context, allowed actions, exclusions, return format, and length limit.
- Tell isolated sessions when they share a workspace and must not revert unrelated changes.
- Do not predict or fabricate sub-session results before they return.
- Consume durable summaries first. Inspect full session content only when needed.
- Preserve session ids in final reports when they materially support decisions or evidence.

## Planning Rules

- Skip formal planning for the easiest localized tasks.
- Do not create single-step plans.
- Maintain one live todo list for multi-step work.
- Update the plan when a phase completes, not in batches at the end.
- Read-only phases must not edit files.

## Editing Rules

- Default to ASCII unless the file already uses non-ASCII or the task requires it.
- Add comments only for non-obvious logic.
- Prefer patch-style edits for manual single-file changes; use generated tools or formatters for generated output.
- Do not introduce dependencies, frameworks, services, storage, or external calls unless requirements or existing patterns justify them.
- Do not commit, push, deploy, alter secrets, or run destructive commands unless explicitly requested.

## Verification Rules

- Reading code is not verification.
- Build failure is FAIL when a build command exists.
- Relevant test failure is FAIL.
- Typecheck/lint failure is FAIL when configured.
- Missing environment or unavailable tooling is PARTIAL unless equivalent proof exists.
- Every PASS needs at least one adversarial or edge probe matched to the change type.

## Output Contract

The root session owns final synthesis and must report:

```text
## Delivery Report

What Changed: ...
Files Changed: ...
Workflow Phases: ...
Skills Used: ...
Sessions Used: ...
Verification: PASS | FAIL | PARTIAL - command/runtime evidence
Risks/Remaining Work: ...
Status: COMPLETE | BLOCKED | PARTIAL
```

## Hard Stops

- Unsafe ambiguity that materially changes product, architecture, data, security, billing, or external impact.
- Unexpected user changes in files that must be edited.
- Missing authority/tooling for a required action.
- Destructive or external-impact action without explicit request.
