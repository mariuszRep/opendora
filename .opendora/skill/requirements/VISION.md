---
name: requirements
description: Single intake and requirements gate that aligns actions to local vision and blocks premature execution. Enforces VISION.md sync gate and strict mismatch block before implementation.
last_updated: 2026-05-03T12:00:00Z
---

# VISION.md - Requirements Skill

## Purpose/Outcome

The requirements skill serves as the single intake gate for unclear, incomplete, or risky requests. It elicits user intent through terse one-question-at-a-time interaction, produces delivery-ready specifications, and enforces strict VISION.md sync before any implementation begins.

**Intended outcome:** Every request that reaches implementation has verified alignment with approved VISION.md intent, with no drift or mismatch allowed.

## Expected Behaviors

1. **Elicitation Loop**: Ask one question at a time, adapt based on answer, continue until sufficient clarity or clear blocker emerges
2. **VISION Sync Gate**: Before handing to delivery, verify requirements match VISION.md approved behaviors
3. **Mismatch Block**: Halt and report if requirements would violate VISION.md intent
4. **User-Only Approval**: Route VISION.md intent changes to user for approval; never agent-auto-approve vision updates
5. **Parity with project-requirements**: Maintain identical interaction style (terse, caveman-lite, one-question loop)
6. **Readiness Outcome**: Produce structured output with goal, scope, acceptance, constraints, open questions, and status

## Boundaries (Non-goals)

- Does NOT execute implementation work during elicitation
- Does NOT hand to delivery with unresolved blockers
- Does NOT invent requirements the user didn't provide
- Does NOT assume technology or architecture before need is understood
- Does NOT serve as a design or architecture skill
- Does NOT maintain completion status or roadmap in VISION.md

## Success Signals

1. Requirements passed to delivery have verified VISION.md alignment
2. No implementation proceeds with VISION.md mismatch
3. User approves all VISION.md intent changes
4. Interaction style matches project-requirements exactly
5. Blockers are clearly stated, not hidden or assumed away
6. Readiness outcome follows the defined template consistently

## Anti-Behaviors

- Proceeding to implementation without checking VISION.md
- Accepting requirements that contradict VISION.md approved intent
- Agent-auto-approving VISION.md changes without user involvement
- Using verbose or fluffy language instead of terse caveman style
- Bundling multiple questions instead of one-at-a-time
- Assuming intent instead of eliciting it
- Handing to delivery with unresolved unknowns that block execution

## Open Intent Questions

- How should VISION.md drift be detected in multi-file/multi-folder contexts?
- Should VISION.md version/commit be recorded in readiness outcome for audit trail?
- Is there a need for a fast-path for trivial changes that don't require VISION.md sync?

## Change Log (Intent-Level)

- 2026-05-03: Added VISION.md governance section to SKILL.md with is/is-not definitions, sync gate, mismatch block, user-only approval, and parity contract
- 2026-05-03: Updated VISION.md with canonical template sections (Purpose, Expected Behaviors, Boundaries, Success Signals, Anti-Behaviors, Open Intent Questions, Change Log)