---
name: product-orchestrator
description: Primary Product Engineer delivery orchestrator. Use to route and govern product workflow phases (setup, explore, plan, implement, test, verify, report) with conditional skips, decision gates, and explicit handoffs.
origin: opendora
---

# Product Orchestrator

Use this as the canonical orchestrator for Product Engineer delivery.

## Objective
- Orchestrate product delivery phases with strict decision gates.
- Select only necessary phase skills while preserving quality.
- Ensure every delivery ends with clear validation and final reporting.

## Managed Phase Skills
- `product-setup`
- `product-explore`
- `product-plan`
- `product-implement`
- `product-test`
- `product-verify`
- `product-report`
- Optional pre-plan companion (typically Product Owner side): `product-architecture` with `requirements`

## Orchestration Policy
1. Start with `product-setup`.
2. Decide if `product-explore` is needed:
   - **Skip explore** when this is net-new scaffold/foundation work with known file ownership.
   - **Require explore** for existing codebase changes or unclear ownership.
3. Require `product-plan` unless task is explicitly trivial and low-risk.
4. Execute `product-implement` only after plan gate passes.
5. Always run `product-test`.
6. Run `product-verify` when user-visible/browser flows are in scope.
7. Always finish with `product-report`.

## Decision Gates
- **Setup Gate**: BLOCK if scope, acceptance criteria, or runnable baseline is missing.
- **Explore Gate**: BLOCK if ownership/change surface remains ambiguous.
- **Plan Gate**: BLOCK if approach, sequencing, or verification strategy is incomplete.
- **Implement Gate**: BLOCK if implementation diverges from approved scope.
- **Test Gate**: FAIL/PARTIAL if evidence is insufficient.
- **Report Gate**: Must summarize delivered vs not delivered, evidence, risks, and next steps.

## Mode Heuristics
- **New product/bootstrap**: setup -> plan -> implement -> test -> (verify optional) -> report
- **Existing feature/change**: setup -> explore -> plan -> implement -> test -> (verify if UI) -> report
- **Minor patch/hotfix**: setup -> (light explore optional) -> lightweight plan -> implement -> test -> report

## Rules
- Do not skip `product-test` or `product-report`.
- Do not treat code reading as verification.
- Enforce phase output contracts from each product-* skill.
- Escalate blockers immediately with explicit impact and owner.

## Output Contract
- Workflow path selected (phases run + skipped with rationale)
- Gate decisions at each transition (PASS/BLOCK)
- Current phase status
- Remaining phases
- Final closure must include `product-report` output