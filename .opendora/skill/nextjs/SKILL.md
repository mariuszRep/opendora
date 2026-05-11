---
name: nextjs
description: Use when building or modifying Next.js applications, routes, rendering behavior, and deployment-safe app structure decisions.
origin: opendora
---

# Next.js

Use this skill when tasks involve creating or changing Next.js apps.

## Scope
- App Router and Pages Router changes
- Server/client component boundaries
- Routing, layouts, metadata, and data fetching
- Build and runtime safety checks

## Workflow
1. Identify the affected route or component boundary.
2. Apply minimal change aligned with existing project conventions.
3. Verify compatibility with rendering mode and runtime constraints.
4. Report file-level impact and verification outcome.

## Rules
- Prefer existing project patterns over introducing new architecture.
- Keep changes minimal and reversible.
- Flag uncertainty around runtime/env assumptions explicitly.