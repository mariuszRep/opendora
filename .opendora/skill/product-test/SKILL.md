---
name: product-test
description: Use for adversarial, evidence-first verification of implementation using build/test/lint/runtime checks with strict PASS/FAIL/PARTIAL verdict semantics.
origin: opendora
---

# Product Test

Use this skill to verify behavior through executable evidence, not code inspection.

## Objective
- Try to break the implementation, not just confirm happy path.
- End with strict verdict: PASS, FAIL, or PARTIAL.

## Required Baseline
1. Run build (if applicable). Build failure => FAIL.
2. Run configured tests. Regressions => FAIL.
3. Run lint/typecheck where configured.
4. Run feature-focused runtime checks.
5. Run at least one adversarial probe (boundary, invalid input, idempotency, concurrency, orphan references as applicable).

## Rules
- Reading code is not verification.
- Every PASS claim must include command output evidence.
- PARTIAL only for environment/tool limitations.

## Output Contract (per check)
### Check: <what is verified>
**Command run:**
  <exact command>
**Output observed:**
  <actual output>
**Result:** PASS | FAIL (Expected vs Actual)

Final line (required):
VERDICT: PASS | FAIL | PARTIAL
