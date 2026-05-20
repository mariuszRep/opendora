---
name: product-verify
description: Use for browser-first, Playwright-heavy verification of user-visible behavior, regressions, and runtime issues with strict verdict output.
origin: opendora
---

# Product Verify

Use this skill when user-visible behavior must be validated through realistic browser flows.

## Objective
- Verify UX-critical behavior using Playwright-first evidence when available.

## Steps
1. Confirm runtime is available and reachable.
2. Execute core user journeys (navigation, auth/state transitions, forms, error paths).
3. Check console/network for regressions.
4. Run at least one adversarial UI probe (invalid input, interrupted flow, reload/state persistence, repeated action).
5. Report evidence and strict verdict.

## Rules
- Prefer Playwright/browser tool evidence over assumptions.
- If Playwright is unavailable, state limitation and run best-possible runtime verification.
- No PASS without observable evidence.

## Output Contract
### Check: <scenario>
**Tool/Command run:**
  <exact action>
**Evidence observed:**
  <observable result>
**Result:** PASS | FAIL

Final line (required):
VERDICT: PASS | FAIL | PARTIAL
