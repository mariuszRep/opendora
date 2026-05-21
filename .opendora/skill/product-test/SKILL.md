---
name: product-test
description: "Use to validate what was actually committed: inspect branch commits/diffs against requirements and plan, run evidence-based tests, and return strict PASS/FAIL/PARTIAL verdict."
origin: opendora
---

# Product Test

Use this skill after `product-built` to test the committed implementation against requirements and plan.

## Objective
- Verify committed behavior, not intent.
- Trace tests to requirements, plan, and actual commit set.

## Required Inputs
- Requirements context
- `product-plan` output
- `product-built` handoff (branch + commit list)

## Steps
1. Inspect git context for current branch and commit range under test.
2. Review commit messages/diffs to understand intended change slices.
3. Build a test matrix mapped to requirements + plan items.
4. Run baseline checks (build/test/lint/typecheck as applicable).
5. Run feature checks plus at least one adversarial probe.
6. Record command evidence and summarize pass/fail by requirement.

## Rules
- Test what was committed; do not assume unstaged work is in scope.
- Reading code alone is not verification.
- Every PASS claim must include executable evidence.
- PARTIAL only for environment/tool limitations.

## Output Contract
- Branch + commit range tested
- Requirement-to-test coverage map
- Per-check evidence:
  - Check
  - Command run
  - Output observed
  - Result
- Failures with reproduction steps
- Final line: `VERDICT: PASS | FAIL | PARTIAL`
- Next phase recommendation: `product-verify` when UI/browser scope exists
