# SCOPE.md

## What this package is

`packages/agent` is a standalone package for managing file-based agents and built-in agent templates.

## What this package owns

- agent CRUD helpers
- built-in template definitions
- package-local file storage logic for agent data

## What this package does not own

- runtime execution of sessions, tools, providers, or CLI commands
- the main server or TUI
- repository-wide agent policy outside this package's storage and template contract

## Boundaries

- `packages/opencode` consumes this package.
- Changes here should avoid assuming a specific UI unless that assumption is already encoded in public types or files.
