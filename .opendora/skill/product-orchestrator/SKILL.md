---
name: product-orchestrator
description: "Canonical Product Engineer workflow orchestrator: route setup/explore/plan/built/test/verify/report with conditional paths, strict gates, and traceable handoffs."
origin: opendora
---

# Product Orchestrator

Use this as the primary orchestrator for Product Engineer delivery.

## Managed Skills
- `product-setup`
- `product-explore`
- `product-plan`
- `product-built`
- `product-test`
- `product-verify`
- `product-report`
- Optional upstream support: `requirements` + `product-architecture`

## Default Flow
1. `product-setup`
2. `product-explore` (conditional)
3. `product-plan`
4. `product-built`
5. `product-test`
6. `product-verify` (conditional for UI/browser scope)
7. `product-report`

## Gate Logic
- Setup Gate: block if baseline/runtime/scripts are not ready.
- Explore Gate: required for existing/unclear code ownership.
- Plan Gate: require explicit file/module strategy and verification plan.
- Built Gate: require branch + commit list handoff.
- Test Gate: require verdict with command evidence.
- Verify Gate: for UI scope, require browser evidence against plan.
- Report Gate: always required; include delivered vs not delivered.

## Skip Rules
- New scaffold work may skip `product-explore` if ownership is explicit.
- Non-UI work may skip `product-verify`.
- Never skip `product-test` or `product-report`.

## Output Contract
- Path selected (run/skip with reasons)
- Gate outcomes (PASS/BLOCK)
- Current phase and next phase
- Final closure references `product-report`
