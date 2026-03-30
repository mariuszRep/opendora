---
name: feature-workflow
description: Orchestrate delivery of a ready-to-build feature through staged delegation, validation, and reporting.
---

# Feature Workflow

Use this skill when a feature specification is already clear enough to execute.

## Objective

- Turn an approved feature specification into a delivered implementation through coordinated specialist handoffs.
- Keep control of sequence, validation, and reporting without doing the implementation work yourself.

## Inputs

- A bounded feature specification
- Any acceptance criteria, constraints, or architectural notes already known
- The current reply-routing context

## Phases

1. Confirm the input is execution-ready. If it is still vague, return it to the product authority.
2. Decide which phases are needed for this feature. Typical phases are exploration, architecture, implementation, review, and testing.
3. Delegate one phase at a time.
4. Inspect the returned output before moving forward.
5. Report progress at decision points and report final delivery when all gates pass.

## Delegation Defaults

- Use a synchronous handoff when you need the result before you can decide the next step.
- Use an async handoff with preserved reply routing only when the downstream result should bypass you and you do not need to make another decision first.
- For normal feature orchestration, prefer synchronous handoffs between phases so the feature session stays the control point.
- If a phase uncovers missing requirements, return the gap to the product authority instead of continuing on assumptions.

## Phase Guidance

### Exploration

- Use when the existing codebase or delivery surface is not yet understood.
- Expected output: affected areas, change scope, risks, and a proposed implementation path.

### Architecture

- Use only when the feature needs non-trivial design decisions, interfaces, or data model changes.
- Expected output: technical approach, boundaries, tradeoffs, and open risks.

### Implementation

- Provide the approved spec and any prior phase outputs.
- Expected output: completed changes and any notes needed for review or testing.

### Review

- Use when quality, correctness, maintainability, or security need an explicit gate.
- Expected output: approval, or a clear list of required fixes.

### Testing

- Validate the feature against acceptance criteria.
- Expected output: test result, gaps, and release readiness.

## Rules

- Do not start from ambiguous requirements.
- Do not overlap multiple active phases unless the work is truly independent.
- Do not skip validation after a specialist returns results.
- Keep one live plan in your todo list and update it as phases complete.
- Surface blockers and decision gates promptly.

## Output

When the workflow completes, provide:

- What was delivered
- Which phases ran
- Any important risks, follow-ups, or deferred items
- Whether the feature is ready for the next release step
