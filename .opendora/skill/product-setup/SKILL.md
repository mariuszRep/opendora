---
name: product-setup
description: Use when initializing or standardizing a product workspace before delivery: scaffold project structure, initialize repo/tooling, install core dependencies, and verify development readiness.
origin: opendora
---

# Product Setup

Use this skill when creating or preparing a product codebase so development can start on a reliable, repeatable foundation.

## Objective
- Establish a production-ready development baseline.
- Make key setup decisions explicit (stack, package manager, runtime, conventions).
- Ensure workspace is runnable, lintable, and test-capable before feature work.

## Scope
This phase may include:
- creating folders/workspace structure
- initializing git repository and baseline files
- initializing framework/application skeleton
- configuring environment/toolchain (Node/Python and related tooling)
- installing core dependencies and setup libraries
- configuring quality defaults (lint/format/type/test scaffolding)

## Steps
1. Confirm setup intent and constraints (stack, runtime, package manager, repo conventions).
2. Create/normalize product folder structure and initialize repository baseline.
3. Detect or validate required runtimes (e.g., Node/Python) and configure environment.
4. Scaffold framework/app foundation and install baseline dependencies.
5. Configure baseline quality/tooling conventions (lint, formatting, test, scripts).
6. Run setup verification commands to confirm readiness.
7. Summarize what was set up and what remains optional for implementation phases.

## Rules
- This is an execution phase; file creation/editing is expected.
- Prefer stable, conventional defaults unless user specifies otherwise.
- Surface missing prerequisites as blockers with exact remediation.
- Keep setup decisions explicit so downstream phases can rely on them.

## Output Contract
- Setup status: READY | PARTIAL | BLOCKED
- Stack/toolchain decisions made
- Structure and baseline files created/updated
- Core dependencies installed
- Verification checks run and results
- Remaining blockers or follow-up setup tasks
- Recommended next phase: `product-explore` or `product-plan`
