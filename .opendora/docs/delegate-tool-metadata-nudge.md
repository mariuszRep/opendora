# Delegate Tool Metadata Nudge: Session Tree Governance

## Problem Statement

Delegations often bypass `<project> (main)` placement without explicit
check. Work spawned outside the project tree creates orphan or flat scopes
that are harder to discover, audit, and govern. Phase-2 soft enforcement
adds guidance nudges — no runtime schema change, no hard blocking.

## Nudge Behavior (Metadata / Guidance Only)

Before project-work delegate, verify parent path under `<project> (main)`:

  1. Check parent session path. If outside tree, include one-line exception
     rationale in the delegation prompt.
  2. Preferred children for active workstream: `requirements`, `delivery`.
  3. Do not block; emit guidance inline as a comment or note.

## Suggested Copy Edits for Delegate Tool Description

Top-level description should carry the governance nudge alongside existing
purpose. Draft recommendation phrased as guidance:

> Use delegate to send a message to another agent session when you want
> that agent to act, think, answer, or continue a conversation. Before
> delegating project work, verify the target session sits under the
> project root. If outside the tree, include a one-line rationale.

## Prompt Parameter Guidance (Recommendations)

- `title`: Name the delegation descriptively; include phase or area.
  Prefer: "delegate: feature-X requirements elicitation"
  Avoid: "do the thing"

- `prompt`: State the ask, scope, and expected output explicitly.
  Include governance note if parent is outside project tree:
  > "[Delegation outside project tree: rationale briefly here]"

## Non-Goals

- No hard runtime validation or blocking on parent session.
- No schema migration for delegate tool parameters.
- No enforcement in the tool implementation itself.

## Success Signals

- Increased % of project delegations under `<project> (main)` root.
- Fewer orphan sessions or flat scopes at project level.
- Delegation prompts with visible tree-rationale notes when out-of-tree.