---
name: product-plan
description: Use after setup/exploration to convert requirements and discovered system context into an ordered implementation plan with clear file targets, dependencies, and verification strategy.
origin: opendora
---

# Product Plan

Use this skill after requirements and setup/exploration evidence are available, to design an executable delivery plan.

## READ-ONLY MODE
Planning phase only. Do not modify files.

## Objective
- Transform requirements + workspace reality into a concrete build plan.

## Inputs
- Requirement artifacts (and `product-architecture` outputs when applicable)
- `product-setup` and/or `product-explore` findings

## Steps
1. Reconfirm scope, non-goals, and acceptance criteria.
2. Validate plan assumptions against setup/exploration evidence.
3. Lock shared contracts needed for parallel work (data model, interfaces/APIs, key UI surface expectations).
4. Define implementation sequence by module/folder ownership.
5. For medium/hard work, decompose into tracks/phases with explicit boundaries and integration order.
6. Identify extra dependencies, migrations, or preparatory tasks.
7. Define verification strategy (test + verify criteria) and completion gates.

## Rules
- Do not start implementation in this phase.
- Make folder/module ownership explicit per planned step.
- Include prerequisite tasks when setup/explore reveals gaps.
- Keep plan directly executable by `product-built`.
- If upstream architecture supplied contracts, preserve them; do not silently diverge without explicit rationale.

## Delegation Planning Contract (mandatory for medium/hard)

When delivery mode is medium or hard, the plan must predefine delegation instead of leaving it ad-hoc.

### Exploration Return Contract (input prerequisite)
Before defining delegation points, ensure exploration findings include:
- key files/modules with exact paths
- ownership boundaries by area
- risk hotspots and unknowns
- recommended split seams for delegation

### Delegation Matrix
For each planned delegation point, include:
- **Delegation Point ID** (D1, D2, ...)
- **Trigger Gate** (exact moment delegation must happen)
- **Target Agent**
- **Skills to Preload**
- **Scope In**
- **Scope Out**
- **Required Return Package**: files changed, decisions made, verification evidence, integration notes/risks
- **Exit Criteria** to continue to next gate

Do not mark medium/hard planning READY unless Delegation Matrix is complete.

## Output Contract
- Plan Summary
- Delivery Mode Recommendation: easy | medium | hard
- Shared Contract Snapshot (data/interface/UI expectations)
- Ordered Implementation Steps (with file/module targets)
- Track/Phase Decomposition (for medium/hard)
- Delegation Matrix (mandatory for medium/hard): trigger gate, target agent, skills, scope-in, scope-out, return package, exit criteria
- Integration Order and Merge/Gate Strategy
- Dependency/Prerequisite Tasks
- Critical Files for Implementation (3-10)
- Risks + Mitigations
- Verification Plan
- Readiness for `product-built`: READY | BLOCKED
