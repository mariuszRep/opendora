---
name: code-exploration
description: Load when you need to inspect a codebase, locate relevant files, explain structure, and identify likely change points before implementation.
origin: opendora
---

# Code Exploration

Use this skill when the task depends on understanding how the current code is organized before making changes.

## Objective

- Find the relevant files, modules, and boundaries for the task.
- Produce a concise map of what matters before implementation begins.

## Steps

1. Start broad: identify the package, app, or directory likely to own the behavior.
2. Search for the key files, symbols, routes, commands, or strings related to the request.
3. Read enough surrounding context to understand how the important pieces connect.
4. Narrow the result to the files and interfaces that are most likely to change.
5. Summarize the findings in implementation-ready form.

## Rules

- Stay grounded in the code that actually exists.
- Prefer concrete file paths, ownership boundaries, and touch points over abstract summaries.
- Read enough context to avoid misleading surface-level matches.
- Stop exploring once the change surface is clear enough to act.
- If uncertainty remains, state exactly what still needs checking.

## Output

Provide:

- relevant files and directories
- how the pieces connect
- likely touch points for the requested change
- notable risks, unknowns, or assumptions