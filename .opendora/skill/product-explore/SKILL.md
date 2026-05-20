---
name: product-explore
description: Use for read-only inspection of the product workspace to confirm baseline setup, identify ownership boundaries, and map exact change surfaces before planning or coding.
origin: opendora
---

# Product Explore

Use this skill to inspect an existing or newly setup workspace and produce a concrete map of what exists and where changes should happen.

## READ-ONLY MODE
Do not create, edit, move, or delete files.

## Objective
- Verify setup state and architecture signals.
- Locate ownership boundaries, interfaces, and implementation touchpoints.

## Steps
1. Confirm baseline setup signals (repo initialized, framework present, scripts/config detected).
2. Search in parallel across file paths, symbols, configs, routes, and tests.
3. Read enough context to connect entry points to modules and dependencies.
4. Identify likely change surface and any setup inconsistencies.
5. Report concrete paths, boundaries, and unresolved unknowns.

## Rules
- Ground every conclusion in existing files/configs.
- Prefer concrete evidence over assumptions.
- Flag setup drift/misalignment for correction before planning.

## Output Contract
- Setup Confirmation Snapshot (what is present/missing)
- Files Found (with ownership role)
- Ownership Chain
- Likely Change Surface
- Risks/Assumptions
- Status: COMPLETE | PARTIAL
