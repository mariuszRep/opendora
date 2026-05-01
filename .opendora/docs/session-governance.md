# Session Governance Policy

## Scope

This policy governs OpenDora session-management behavior. It does not apply to repo-local AGENTS.md files or other non-OpenDora session systems.

## Canonical Root Naming

For each managed project, maintain one canonical root session named `<project> (main)`. This root serves as the anchor for all project-related work.

## Branch Pattern and Naming Conventions

Preferred session tree structure:

```
<project> (main)
  ├── initiation
  ├── feature <name>
  │   ├── requirements
  │   └── delivery
  ├── bug <id>
  │   ├── requirements
  │   └── delivery
  └── migration <name>
      ├── requirements
      └── delivery
```

- Use `requirements` child sessions for readiness work (elicitation, clarification, approval).
- Use `delivery` child sessions for implementation work (execution, verification, handoff).

## Delegate-Time Enforcement

Before delegating project work, verify the correct parent session exists in the project tree. If the `<project> (main)` root does not exist, create it or route to its creation before delegating delivery work.

## Exception Protocol

Exceptions are allowed only for:

- Clearly non-project global operations
- Tiny one-off tasks that do not warrant project-tree placement

When an exception is used, record a one-line rationale in the session or delegation context.

## Enforcement Gates

Two behavioral policy gates enforce delegation and recovery discipline:

- **Delegation Readiness Gate**: Applied before any cross-agent handoff. Requires classification, skill inspection, tool sufficiency check, return-path definition, and one-line rationale.
- **Worker Failure Recovery Gate**: Applied after repeated tool-call failures of the same class. Requires hard stop, workspace re-anchor, and blocker reporting if re-anchor fails.

These are behavioral policy gates, not runtime schema enforcement.