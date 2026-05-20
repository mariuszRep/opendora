---
name: product-built
description: Use to execute approved plans with minimal, convention-aligned code changes and explicit verification handoff.
origin: opendora
---

# Product Built

Use this skill when plan approval exists and code changes are authorized.

## Objective
- Implement only the approved scope with minimal, reviewable diffs.

## Steps
1. Reconfirm scope, non-goals, and affected files from plan.
2. Implement changes incrementally and preserve established patterns.
3. Validate locally with relevant checks (build/tests/lint/typecheck).
4. Confirm no unintended scope expansion.
5. Prepare structured handoff to test/verify.

## Rules
- No speculative features or opportunistic refactors.
- Prefer small, auditable changes.
- If uncertainty blocks correctness, stop and surface blocker.

## Output Contract
- Scope implemented
- Files changed (and why)
- Checks run + outcomes
- Known limitations/risks
- Recommended next: `product-test` and/or `product-verify`
