---
name: product-verify
description: "Use for browser-first verification against the approved plan: validate implemented UI flows/pages with Playwright-focused evidence and strict verdict output."
origin: opendora
---

# Product Verify

Use this skill when user-visible behavior must be verified against the plan.

## Objective
- Compare planned UI/flow outcomes with real browser behavior.
- Produce observable evidence for pass/fail decisions.

## Required Inputs
- `product-plan` (expected pages/flows/outcomes)
- `product-test` summary
- Runtime access details

## Steps
1. Extract planned pages, journeys, and expected outcomes from `product-plan`.
2. Ensure browser verification capability is available (load `playwright-browser` when needed).
3. Execute planned journeys and key negative flows.
4. Validate visible state, console/network health, and persistence/regression points.
5. Report per-scenario evidence and verdict.

## Rules
- Verification scope is plan-driven; call out out-of-plan observations separately.
- No PASS without observable browser/runtime evidence.
- If Playwright/browser tooling is unavailable, state limitation and return PARTIAL unless alternate runtime proof is sufficient.

## Output Contract
- Plan scenarios verified
- Per-scenario evidence:
  - Scenario
  - Tool/Command run
  - Evidence observed
  - Result
- Gaps between plan and implementation
- Final line: `VERDICT: PASS | FAIL | PARTIAL`
