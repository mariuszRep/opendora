---
name: code-exploration
description: Load when you need to inspect a codebase, locate relevant files, explain structure, and identify likely change points before implementation. READ-ONLY exploration phase.
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

## Harness

### Inputs

- **Task scope** — what change is being explored, bounded area
- **Thoroughness level** — quick | medium | thorough (default: medium)
- **Areas to search** — file patterns, symbol names, keywords, routes, configs

### Allowed Actions/Tools

- **read** — inspect files, read context around matches
- **glob** — find files by pattern
- **grep** — search content by regex
- **bash** — read-only commands: `ls`, `git log`, `git diff`, `head`, `tail`
- **NO edit/write** — this is read-only mode

### Verification

- Confirm search covered all stated areas
- Verify at least one match found in each search angle
- Check that findings include relevant file paths and ownership boundaries

### Output Contract

Provide:

```
## Exploration Results

**Search Strategy:** [quick|medium|thorough]

**Files Found:**
- [path/to/file1.ts] - owning module/feature
- [path/to/file2.ts]

**Ownership Chain:**
- [how pieces connect]

**Likely Change Surface:**
- [files/modules to modify]
- [specific interfaces/entry points]

**Risks/Assumptions:**
- [open risks or unknowns]

**Status:** COMPLETE
```
