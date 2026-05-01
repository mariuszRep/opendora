# Delegation Readiness Gate Checklist

## Purpose

Enforce discipline before any cross-agent delegation. This gate applies to all `delegate` calls regardless of agent role or session type. It ensures delegation is intentional, justified, and properly routed.

## When to Use

Apply this gate before every `delegate` call. Do not use it for `reply`, `question`, or other communication tools.

## Mandatory Pre-Delegation Checks

| # | Check | Pass Condition | Fail Action |
|---|-------|----------------|-------------|
| 1 | Work Classification | Work is classified as ecosystem, product/development, or session-lifecycle | Clarify classification before delegating |
| 2 | Ownership Confirmation | Work is outside local execution capability OR better owned by another agent | Execute locally or re-assign |
| 3 | Skill Inspection | Available skills inspected; if in-domain skill exists, it is loaded instead of delegating | Load matching skill |
| 4 | Tool Sufficiency | Local tools are sufficient for the work | Do not delegate |
| 5 | Return Path Defined | Sync or async mode chosen with explicit reason | Define return path in prompt |
| 6 | Rationale Recorded | One-line delegation rationale included in prompt | Add rationale before calling delegate |

## Gate Outcome

- **ALL checks pass**: Proceed with delegation.
- **ANY check fails**: Do not delegate. Resolve the gap locally or clarify before proceeding.

## Notes

- This is a behavioral policy gate, not a runtime schema enforcement mechanism.
- The gate applies before the `delegate` call, not after.
- Skill inspection takes priority: always check for in-domain skills before delegating.
- The one-line rationale should explain why delegation is needed, not what the delegate should do.

## Relationship to Other Gates

This gate works with the Worker Failure Recovery Gate defined in engineer/PERSONA.md. The Delegation Readiness Gate prevents unnecessary or premature delegation, while the Worker Failure Recovery Gate handles repeated tool failures during execution.