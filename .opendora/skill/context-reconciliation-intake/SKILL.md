---
name: context-reconciliation-intake
description: Load at the start of intake when deciding whether to continue existing work or start new delivery; performs topic/session reconciliation first, then project-path discovery, and enforces evidence-backed reuse decisions to avoid duplicate sessions and redundant project creation.
origin: opendora
---

---
name: context-reconciliation-intake
description: Load at the start of intake when deciding whether to continue existing work or start new delivery; performs topic/session reconciliation first, then project-path discovery, and enforces evidence-backed reuse decisions to avoid duplicate sessions and redundant project creation.
---

# Context Reconciliation Intake

Use this skill before creating a new project session or handing work to delivery when there is any chance related work already exists.

## Objective

- Prevent duplicate delivery and redundant project creation.
- Reuse prior sessions and project folders when evidence supports reuse.
- Require artifact evidence before claiming prior delivery is complete.

## Inputs

- Requested topic or outcome from the user.
- Current working directory or known workspace root.
- Any candidate project or session names already mentioned by the user.

## Workflow

1. Topic-Level Session Discovery (first)
- Build at least two search variants from the request: one feature/outcome phrase and one domain/product phrase.
- Run `session_search` using these variants.
- If results are ambiguous, inspect top candidates with `session_get`.
- When relationship clarity matters, inspect candidate hierarchy with `session_tree`.
- Decide one path explicitly:
  - `continue-existing-session`
  - `switch-to-existing-session`
  - `reattach-parent-child`
  - `new-session`
- Do not create or hand off new delivery work until this decision is stated.

2. Filesystem/Project Discovery (second)
- Search likely project roots near the current workspace using `glob` with topic/domain terms.
- Confirm candidates by reading lightweight context docs when present: `AGENTS.md`, `VISION.md`, `README.md`.
- Choose one path explicitly:
  - `reuse-existing-project-path`
  - `new-project-path`
- If reusing is plausible but context docs are missing, record context debt and create lightweight references before handoff:
  - `AGENTS.md` for agent operating constraints in that folder.
  - `VISION.md` for durable intent.
  - `README.md` for human setup/run memory.

3. Evidence Gate
- Never claim prior delivery complete without artifact proof.
- Acceptable proof includes one or more of:
  - Session evidence showing accepted handoff and completion criteria met.
  - Code or file artifacts that match requested scope.
  - Verification evidence in-session (tests/build/check output) tied to artifacts.
- If proof is missing, mark status as `unverified-prior-delivery` and continue with guarded reuse or fresh planning.

4. Decision and Routing
- Prefer reuse when credible evidence exists.
- Prefer new session/project only when evidence is absent or conflicting.
- Keep actions local unless out-of-scope or blocked by missing authority/tools.
- Delegate only after reconciliation result is explicit and bounded.

## Required Output Fields

Return this block before any delivery handoff:

```text
session_correlation:
  query_terms: [ ... ]
  matches: [session ids/titles]
  decision: continue-existing-session | switch-to-existing-session | reattach-parent-child | new-session
  rationale: <why>

project_discovery:
  query_terms: [ ... ]
  candidates: [paths]
  decision: reuse-existing-project-path | new-project-path
  selected_path: <path or none>
  context_docs:
    AGENTS.md: present | missing
    VISION.md: present | missing
    README.md: present | missing
  context_debt_action: none | create-lightweight-docs

evidence_gate:
  prior_delivery_status: verified | unverified-prior-delivery | no-prior-delivery-found
  proof: [artifacts/sessions/tests]

readiness:
  status: ready | blocked | deferred
  blocker: <exact blocker or none>
```

## Rules

- Order is strict: session discovery first, filesystem discovery second.
- Use `session_search` intentionally; avoid one-shot title matching.
- Require evidence before completion claims.
- If blocked, state exact blocker and why local resolution is impossible.
- Keep reports terse and artifact-referenced.
