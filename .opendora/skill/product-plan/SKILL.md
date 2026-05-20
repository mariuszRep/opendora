---
name: product-plan
description: Use for read-only delivery planning to transform requirements and exploration findings into an ordered, testable implementation strategy.
origin: opendora
---

# Product Plan

Use this skill when coding should not start until a concrete implementation plan exists.

## READ-ONLY MODE
Planning phase only. Do not modify files.

## Objective
- Produce a stepwise implementation strategy aligned with architecture and constraints.

## Steps
1. Reconfirm requirements, non-goals, and acceptance checks.
2. Revisit key exploration evidence and current project patterns.
3. Design approach options and select one with explicit trade-offs.
4. Define ordered implementation steps with dependencies.
5. Define verification approach (what proves done).

## Rules
- Follow existing architecture unless deviation is justified.
- Make trade-offs and risks explicit, not implicit.
- Plan must be executable without reinterpretation.

## Output Contract
- Plan Summary
- Selected Approach + Why
- Step-by-step Implementation Strategy
- Critical Files for Implementation (3-7)
- Risks + Mitigations
- Verification Plan (commands/tests/user flows)
