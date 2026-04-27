---
name: architecture-analysis
description: Load when a task needs technical design, affected-area analysis, tradeoffs, or a recommended implementation approach before coding.
---

# Architecture Analysis

Use this skill when approved work needs technical planning before implementation.

## Objective

- Turn a bounded request into a clear technical approach.
- Identify affected areas, boundaries, risks, and tradeoffs so implementation can proceed safely.

## Steps

1. Read the approved request and identify the functional scope.
2. Inspect the current code surface that owns the behavior, data flow, and interfaces involved.
3. Define the likely change boundaries: files, modules, APIs, schemas, state, or user flows.
4. Recommend an implementation approach that fits the existing architecture.
5. Call out key risks, dependencies, and open decisions.
6. Hand back an implementation-ready design summary.

## Rules

- Work from bounded requirements, not guesses.
- Prefer the simplest approach that fits existing patterns.
- Make tradeoffs explicit when multiple paths are viable.
- Do not drift into implementation details unless they materially affect the design.
- If the request is too ambiguous for safe design, state the blocking ambiguity clearly.

## Output

Provide:

- scope and affected areas
- recommended approach
- risks, tradeoffs, and dependencies
- open decisions or blockers