---
name: product-explore
description: Use for read-only exploration to locate ownership boundaries, interfaces, and exact change surface before planning or coding.
origin: opendora
---

# Product Explore

Use this skill when implementation depends on understanding existing code organization.

## READ-ONLY MODE
Do not create, edit, move, or delete files. Use read-only operations only.

## Objective
- Find the real owner files, interfaces, and dependency paths.
- Produce an implementation-ready map with minimal ambiguity.

## Search Strategy
Run independent searches in parallel:
- File patterns (owners, handlers, services, tests, config)
- Symbol searches (functions/classes/types)
- String searches (routes, flags, keys, user-visible text)

## Steps
1. Identify likely owning module/package.
2. Execute parallel searches across naming + symbol + content angles.
3. Read enough context to connect entry points to downstream effects.
4. Narrow to concrete files and interfaces likely to change.
5. Report with explicit uncertainty and what still needs checking.

## Rules
- Ground findings in actual files and lines; no assumptions.
- Prefer concrete boundaries over high-level summaries.
- Stop once change surface is clear enough to implement.

## Output Contract
## Exploration Results
- Search Strategy: quick | medium | thorough
- Files Found (with role)
- Ownership Chain
- Likely Change Surface
- Risks/Assumptions
- Status: COMPLETE | PARTIAL
