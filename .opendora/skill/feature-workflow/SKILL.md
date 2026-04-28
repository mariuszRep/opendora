---
name: feature-workflow
description: Orchestrate delivery of a ready-to-build feature through skill-driven phases, implementation, validation, and reporting. Load this for approved feature work that needs more than a direct small code change.
---

# Feature Workflow

Use this skill when a feature specification is already clear enough to execute.

## Objective

- Turn an approved feature specification into a delivered implementation through staged, skill-driven execution.
- Keep one delivery owner in control of sequencing, validation, and reporting.
- Avoid agent handoffs for normal feature phases when an attached skill can guide the work.

## Inputs

- A bounded feature specification
- Acceptance criteria or expected behavior
- Constraints, architectural notes, or prior readiness findings
- The current reply-routing context

## Phases

1. Confirm the input is execution-ready. If it is vague, unapproved, or missing acceptance criteria, return the gap to the product authority.
2. Decide which phases are needed. Typical phases are exploration, architecture, implementation, review, and testing.
3. Load the skill that matches the next phase before doing substantial phase work.
4. Execute one phase at a time, preserving the findings needed by later phases.
5. Validate each phase output before moving forward.
6. Report progress at decision points and final delivery when all gates pass.

## Skill-First Coordination

- Use skills as the default coordination mechanism for feature delivery.
- Use code exploration when the relevant code surface is unknown.
- Use architecture analysis when the work needs non-trivial technical design, interface changes, data model changes, or tradeoff decisions.
- Implement directly after exploration or architecture is clear enough to act.
- Use a review gate when the change is risky, broad, security-sensitive, or likely to benefit from a structured quality check.
- Validate with tests, builds, linters, type checks, or focused runtime checks that match the change.

## Phase Guidance

### Exploration

- Use when the existing codebase, behavior owner, or delivery surface is not yet understood.
- Expected output: relevant files, ownership boundaries, likely touch points, risks, and a proposed implementation path.

### Architecture

- Use only when design decisions materially affect the implementation.
- Expected output: technical approach, change boundaries, tradeoffs, dependencies, and open risks.

### Implementation

- Work from the approved spec and any prior phase outputs.
- Keep changes small, conventional, and testable.
- Expected output: completed code changes and notes needed for review or testing.

### Review

- Use when quality, correctness, maintainability, or security need an explicit gate.
- Expected output: approved, or fixes required with concrete issues.

### Testing

- Validate the feature against acceptance criteria and changed behavior.
- Expected output: checks run, results, gaps, and release readiness.

## Communication Tools

- Use `reply` to report delivery status, final results, verification, blockers, or handbacks through the established return path.
- Use `delegate` only if this workflow has access to it and another agent must act or answer; otherwise report the need back to the owner with `reply`.
- Use `question` only if this workflow has access to it and the human user must answer; otherwise report the needed user question back to the owner with `reply`.
- Do not use `reply` to ask the user or another agent a follow-up question.
- Product or requirement gaps must go back to the product authority; do not resolve them inside delivery.

## Rules

- Do not start from ambiguous or unapproved requirements.
- Do not overlap multiple active phases unless the work is truly independent.
- Do not delegate normal feature phases to agents when a loaded skill can guide the phase.
- Do not skip validation after implementation.
- Keep one live plan in your todo list and update it as phases complete.
- Surface blockers and product decision gaps promptly.

## Output

When the workflow completes, provide:

- What was delivered
- Which phases and skills ran
- What verification ran and what remains unverified
- Any important risks, follow-ups, or deferred items
- Whether the feature is ready for the next release step
