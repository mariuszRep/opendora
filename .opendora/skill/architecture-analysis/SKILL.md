---
name: architecture-analysis
description: Load when a task needs technical design, affected-area analysis, tradeoffs, or a recommended implementation approach before coding.
---

# Architecture Analysis

Use this skill when approved work needs technical planning before implementation.

## READ-ONLY MODE

This phase is design and planning only. Do not create, edit, move, or delete any files. Do not run commands that change state. Exploration and inspection are the only permitted operations.

## Objective

- Turn a bounded request into a clear, implementation-ready technical approach.
- Identify affected areas, boundaries, risks, and tradeoffs so implementation can proceed safely.
- Produce a spec detailed enough that implementation needs no further design decisions.

## Steps

1. Read the approved request and identify the functional scope.
2. Explore the current code surface that owns the behavior, data flow, and interfaces involved — run parallel searches across multiple angles (file names, symbols, routes, schemas).
3. Find existing patterns and conventions for the type of change being made. Identify similar features as reference.
4. Define the likely change boundaries: exact files, modules, APIs, schemas, state, or user flows.
5. Recommend an implementation approach that fits the existing architecture and uses existing patterns.
6. Identify dependencies and sequencing — what must be done first, what can run in parallel.
7. Anticipate potential challenges and call out open risks or decisions.
8. Hand back an implementation-ready design summary.

## Rules

- Work from bounded requirements, not guesses.
- Prefer the simplest approach that fits existing patterns.
- Make tradeoffs explicit when multiple paths are viable.
- Include specific file paths, line numbers, and type signatures — not abstract descriptions.
- Do not drift into implementation details unless they materially affect the design.
- If the request is too ambiguous for safe design, state the blocking ambiguity clearly.

## Output

Provide all of:

- scope and affected areas
- recommended approach with rationale
- step-by-step implementation strategy
- risks, tradeoffs, and dependencies
- open decisions or blockers

End with:

### Critical Files for Implementation
List 3–6 files most critical for implementing this plan:
- `path/to/file1.ts`
- `path/to/file2.ts`