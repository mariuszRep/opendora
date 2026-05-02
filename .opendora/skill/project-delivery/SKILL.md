---
name: project-delivery
description: Orchestrate delivery of a ready-to-build feature through skill-driven phases, implementation, validation, and reporting. Load this for approved feature work that needs more than a direct small code change.
---

# Project Delivery

Use this skill when a feature specification is already clear enough to execute.

## Objective

- Turn an approved feature specification into a delivered implementation through staged, skill-driven execution.
- Keep one delivery owner in control of sequencing, synthesis, and reporting.
- Avoid agent handoffs for normal feature phases when an attached skill can guide the work.

## Inputs

- A bounded feature specification
- Acceptance criteria or expected behavior
- Constraints, architectural notes, or prior readiness findings
- The current reply-routing context

## Workflow Phases

The four standard phases are: **Research → Synthesis → Implementation → Verification**

### Phase 1: Research

- Load `code-exploration` and/or `architecture-analysis` to understand the codebase and design the approach.
- Run read-only exploration. Do not implement yet.
- Specify thoroughness level when loading `code-exploration` (quick/medium/thorough).
- Independent research angles can run in parallel.

### Phase 2: Synthesis (mandatory before implementation)

After research, synthesize findings before writing a single line of code. This is your most important job.

- Read the exploration findings yourself. Understand the approach.
- Write an implementation spec that proves you understood: include specific file paths, line numbers, type signatures, and exactly what to change.
- Never write "based on the findings, implement it" — that delegates understanding instead of doing it yourself.
- The spec must state what "done" looks like.

**Good spec**: "Fix the null pointer in `src/auth/validate.ts:42`. The `user` field on `Session` is undefined when the session expires but the token remains cached. Add a null check before `user.id` access — if null, return 401. Run `bun test src/auth` and report result."

**Bad spec**: "Based on the exploration, fix the auth bug." — No. Synthesize first.

### Phase 3: Implementation

- Work from the synthesized spec and prior phase outputs.
- Keep changes small, conventional, and testable.
- After changes: run relevant tests, typecheck, and linter. Fix failures before proceeding.
- Expected output: completed code changes with test/typecheck results.

### Phase 4: Verification

- Load `review-gate` for the final quality check.
- Verification means proving the code works, not confirming it exists.
- Run builds, tests, and targeted runtime checks.
- Try edge cases and error paths the implementation did not cover.
- Expected output: PASS, FAIL, or PARTIAL verdict with evidence.

## Deciding Which Phases to Run

| Task size | Phases |
|-----------|--------|
| Small, single-file, low-risk | Skip research; implement directly; review-gate |
| Medium, multi-file | Research (medium thoroughness) → Synthesis → Implementation → Verification |
| Hard, cross-cutting or high-risk | Research (thorough) → Architecture → Synthesis → Implementation → Verification |

When in doubt, do research first. Research is cheap. Wrong implementation is expensive.

## Parallel Execution

Independent work can run concurrently. Examples:
- Two unrelated files can be searched at the same time during research.
- Tests and typecheck can run at the same time after implementation.
- Do NOT run implementation in parallel with itself on overlapping files.

## Skill-First Coordination

- Use skills as the default coordination mechanism for every phase.
- Load `project-context` before touching any project folder.
- Load `code-exploration` before implementing in an unfamiliar area.
- Load `architecture-analysis` when the work needs non-trivial design decisions.
- Load `review-gate` for any change that is risky, broad, or security-sensitive.

## Communication Tools

- Use `reply` to report delivery status, final results, verification, blockers, or handbacks.
- Use `delegate` only when another agent must act or answer.
- Use `question` only when the human user must answer.
- Do not use `reply` to ask questions.
- Product or requirement gaps must go back to the product authority.

## Rules

- Do not start from ambiguous or unapproved requirements.
- Do not skip synthesis after research.
- Do not skip verification after implementation.
- Do not delegate normal feature phases to agents when a loaded skill can guide the phase.
- Keep one live plan in your todo list and update it as phases complete.
- Surface blockers and product decision gaps promptly.

## Output

When the workflow completes, provide:

- What was delivered
- Which phases and skills ran
- Synthesis spec used (summarized)
- What verification ran and its result (PASS/FAIL/PARTIAL)
- Any important risks, follow-ups, or deferred items
- Whether the feature is ready for the next release step