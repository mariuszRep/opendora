---
name: code-exploration
description: Load when you need to inspect a codebase, locate relevant files, explain structure, and identify likely change points before implementation.
---

# Code Exploration

Use this skill when the task depends on understanding how the current code is organized before making changes.

## READ-ONLY MODE

This phase is exploration only. Do not create, edit, move, or delete files. Do not run commands that change state (no mkdir, touch, rm, cp, mv, git add/commit, npm install). Use read-only operations only: ls, cat, head, tail, git log, git diff, find, grep.

## Objective

- Find the relevant files, modules, and boundaries for the task.
- Produce a concise, implementation-ready map of what matters.

## Thoroughness Levels

The caller should specify a level. Default to **medium** when not specified.

- **quick** — locate the primary owner file and the 2–3 most relevant symbols. Stop once the entry point is clear.
- **medium** — trace the ownership chain, find related files and interfaces, identify likely change surface.
- **thorough** — exhaustive multi-angle search: multiple naming conventions, related tests, configuration, migration files, type boundaries, and usage sites. Use when the task is broad or high-risk.

## Steps

1. Identify the package, app, or directory likely to own the behavior.
2. Launch parallel searches across multiple angles simultaneously — do not serialize independent searches:
   - search by file name patterns and directory structure
   - search by symbol, function, or class name
   - search by string content, route path, or config key
3. Read enough context around matches to understand how pieces connect. Avoid shallow surface matches.
4. Narrow to the files and interfaces most likely to change.
5. Summarize findings in implementation-ready form.

## Parallel Search Strategy

Batch independent searches into a single round. For example, searching for a feature name, its test file, and its route handler can all run at once. Only wait for one search before starting another when the next search depends on what the first found.

## Rules

- Stay grounded in the code that actually exists. No assumptions.
- Prefer concrete file paths, line references, ownership boundaries, and touch points over abstract summaries.
- Read enough context to avoid misleading surface-level matches.
- Stop exploring once the change surface is clear enough to act.
- State exactly what still needs checking if uncertainty remains.

## Output

Provide:

- relevant files and directories with paths
- how the pieces connect (data flow, call chain, ownership)
- likely touch points for the requested change
- notable risks, unknowns, or assumptions
- search strategy used (quick/medium/thorough) and why it was sufficient