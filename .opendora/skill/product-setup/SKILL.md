---
name: product-setup
description: Use at the start of product delivery to establish a verified baseline: scope, conventions, runnable scripts, constraints, and blockers before explore/plan/implement.
origin: opendora
---

# Product Setup

Use this skill when delivery is starting and execution readiness is unknown.

## Objective
- Establish a trusted baseline before any planning or implementation.
- Prevent false starts caused by missing scripts, unclear scope, or environment gaps.

## Steps
1. Read delivery context and standards (README, CLAUDE.md, manifests, config, test/build scripts).
2. Confirm intended outcome, explicit non-goals, and acceptance criteria.
3. Check repository baseline and available commands (read-only checks first).
4. Identify hard blockers and classify them as requirement, environment, or dependency issues.
5. Return a go/no-go setup report and recommend the next phase skill.

## Rules
- No feature implementation in setup phase.
- Do not invent acceptance criteria; mark missing criteria as blocker.
- Prefer existing project conventions and scripts.
- Keep output short, factual, and decision-oriented.

## Output Contract
- Setup status: READY | BLOCKED
- Scope + non-goals (confirmed)
- Commands/scripts available for build/test/lint
- Blockers (with type and impact)
- Next skill: `product-explore` or `product-plan`
