---
name: session-eval
description: Evaluate session quality, execution efficiency, and routing correctness using session history evidence. Use for session audits and workflow quality checks.
origin: opendora
---

# Session Evaluation Skill

Use this skill when you need to evaluate whether a session was executed correctly, efficiently, and with proper routing.

## Alias Triggers

- "session eval"
- "evaluate session"
- "session audit"
- "workflow quality check"

## Objective

- Assess session quality against explicit criteria.
- Identify routing errors, wasted steps, and missing verification.
- Produce actionable remediation guidance.

## Variables

- `{{session_id}}` - target session to evaluate.
- `{{criteria}}` - quality dimensions and pass conditions.
- `{{scope}}` - message-only or full subtree.

## Steps

1. Load session context using `session_get` and `session_tree`.
2. Score behavior against criteria.
3. Flag routing, tool-selection, and verification failures.
4. Quantify waste indicators (extra steps, repeated work).
5. Report pass/fail and improvement actions.

## Rules

- Ground findings in concrete message/tool evidence.
- Distinguish hard-rule violations from soft optimization opportunities.
- When evaluating subtree scope, include all descendants.