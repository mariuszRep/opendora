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
3. Define implementation sequence by module/folder ownership.
4. Identify extra dependencies, migrations, or preparatory tasks.
5. Define verification strategy (test + verify criteria) and completion gates.

## Rules
- Do not start implementation in this phase.
- Make folder/module ownership explicit per planned step.
- Include prerequisite tasks when setup/explore reveals gaps.
- Keep plan directly executable by `product-built`.

## Output Contract
- Plan Summary
- Ordered Implementation Steps (with file/module targets)
- Dependency/Prerequisite Tasks
- Critical Files for Implementation (3-10)
- Risks + Mitigations
- Verification Plan
- Readiness for `product-built`: READY | BLOCKED
