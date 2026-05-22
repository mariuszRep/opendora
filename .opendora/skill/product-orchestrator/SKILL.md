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

## Difficulty-Based Delivery Modes
Select one mode before build execution:

- **easy**: stay in current session; no delegation split unless blocked by missing authority/tool access
- **medium**: create a shared plan/contract first, then split into 2-4 focused tracks (e.g., frontend, backend/API, data/storage, integration/test)
- **hard**: define phased delivery first; each phase can run the medium pattern (shared contract -> isolated tracks -> integration gate)

If an upstream `product-architecture` Delivery Brief exists, treat it as the governing contract for planning and routing.

## Delegation Contract (medium/hard)
For each delegated track, pass:
- shared goal and acceptance criteria
- shared contracts (data model, interface/API, UI surface expectations)
- explicit track scope and non-goals
- required return format: files changed, decisions made, verification evidence, integration notes

Run an integration gate after track completion before final testing/reporting.

## Delegation Execution Enforcement
- For medium/hard mode, do not start implementation until `product-plan` provides a complete Delegation Matrix.
- Delegate at the exact trigger gates defined in plan (or explicit parallel groups).
- Each delegation must preload the skills listed in the matrix.
- Reject/redo any delegated handback that misses required return package fields.
- Run integration gate after each delegated phase/group before proceeding.

## Gate Logic
- Setup Gate: block if baseline/runtime/scripts are not ready.
- Explore Gate: required for existing/unclear code ownership.
- Plan Gate: require explicit file/module strategy, verification plan, and (for medium/hard) Delegation Matrix.
- Delegation Gate: for medium/hard, enforce trigger points, required skills, scope boundaries, and return package completeness.
- Built Gate: require branch + commit list handoff.
- Test Gate: require verdict with command evidence.
- Verify Gate: for UI scope, require browser evidence against plan.
- Report Gate: always required; include delivered vs not delivered.

## Skip Rules
- New scaffold work may skip `product-explore` if ownership is explicit.
- Non-UI work may skip `product-verify`.
- Easy mode should avoid delegation split unless a concrete blocker requires it.
- Never skip `product-test` or `product-report`.

## Output Contract
- Mode selected: easy | medium | hard (with rationale)
- Path selected (run/skip with reasons)
- Gate outcomes (PASS/BLOCK)
- Delegation map (if used): tracks/phases + owners + scope
- Delegation compliance status (for medium/hard): matrix present, trigger gates respected, return packages complete
- Current phase and next phase
- Final closure references `product-report`
