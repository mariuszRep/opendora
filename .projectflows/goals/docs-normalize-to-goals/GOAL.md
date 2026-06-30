---
name: docs-normalize-to-goals
title: Normalize project documentation to canonical GOAL-based structure
description: Replace legacy MIGRATION.md, docs/CROSS_PLATFORM_DELIVERY.md, and stale AGENTS.md with canonical GOAL.md files. Update cross-references across all docs. This goal tracks the cleanup itself.
status: done
type: chore
scope: root, packages/session, packages/storage, packages/workflow, packages/runtime, packages/tools, packages/provider, apps/desktop, docs/
attempt: 0
max_attempts: 1
last_result: completed
next_action: none — this goal is done.
success_criteria:
  - Unified Durable Run GOAL created from root + package MIGRATION files.
  - Cross-Platform Delivery GOAL created from docs/CROSS_PLATFORM_DELIVERY.md.
  - All MIGRATION.md files replaced with pointer files.
  - docs/CROSS_PLATFORM_DELIVERY.md replaced with pointer file.
  - All cross-references updated to point to new GOAL paths.
  - packages/session/AGENTS.md rewritten from stale @pingpong/core to OpenDora reality.
  - packages/provider/AUTHENTICATION.md folded into README.md and removed.
source: product-owner-approved spec
---

# Normalize project documentation to canonical GOAL-based structure

## Goal

Replace the legacy MIGRATION.md and docs/CROSS_PLATFORM_DELIVERY.md files with canonical GOAL.md files in `.projectflows/goals/`. The content of each MIGRATION.md file is preserved as implementation guidance within the respective GOAL.md. Noncanonical reference patterns in AGENTS.md, VISION.md, README.md, INSTALL.md, and existing GOALs are updated to point to the new GOAL paths.

## Result

- Created `.projectflows/goals/unified-durable-run/GOAL.md` — consolidates root + package MIGRATION content
- Created `.projectflows/goals/cross-platform-delivery/GOAL.md` — consolidates docs/CROSS_PLATFORM_DELIVERY.md content
- Updated all cross-references across AGENTS.md, VISION.md, README.md, INSTALL.md, existing GOALs
- Rewrote `packages/session/AGENTS.md` from stale @pingpong/core to OpenDora reality
- Folded `packages/provider/AUTHENTICATION.md` into `packages/provider/README.md` and removed standalone file
- Replaced all MIGRATION.md files with short pointer stubs
- Replaced docs/CROSS_PLATFORM_DELIVERY.md with short pointer stub

## Files changed

See the delivery report from the docs-normalize-to-goals session for full file list.
