---
name: review-gate
description: Load when completed work needs a read-first quality check for correctness, maintainability, consistency, and delivery risk.
origin: opendora
---

# Review Gate

Use this skill when implementation is complete and you need to judge whether it is ready to hand back.

## Objective

- Inspect completed work for issues that could block safe delivery.
- Produce a clear approval or fix-needed outcome with concrete reasons.

## Steps

1. Read the changed files and the nearby context that explains the design.
2. Compare the implementation against the task, existing conventions, and likely failure modes.
3. Check for correctness gaps, risky assumptions, maintainability problems, and inconsistent patterns.
4. Separate substantive issues from minor style preferences.
5. Return a clear gate decision.

## Rules

- Focus on issues that materially affect correctness, safety, maintainability, or delivery confidence.
- Do not invent requirements that were never part of the task.
- Do not block on cosmetic preferences.
- If the work looks sound, say so plainly.
- When raising an issue, explain why it matters and where it appears.

## Output

Return one of:

- approved
- fixes required

Include the key reasons for that outcome.