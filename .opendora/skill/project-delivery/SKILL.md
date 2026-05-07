---
name: project-delivery
description: Orchestrate professional app/software delivery through triage, broad skill scan, context, research, synthesis, implementation, browser/runtime validation, and evidence-backed reporting. Load this for any approved engineering change beyond a tiny one-file edit.
---

# Project Delivery

Use this skill when a feature specification is clear enough to execute.

## Objective

- Turn an approved feature specification into delivered software through staged, skill-driven execution.
- Keep one delivery owner in control of sequencing, synthesis, implementation, and reporting.
- Keep Product Engineer's persona clean by housing delivery harness rules here.
- Prefer skills over agent handoffs for normal delivery phases.

## Inputs

- A bounded feature specification
- Acceptance criteria or expected behavior
- Constraints, architectural notes, or prior readiness findings
- Current reply-routing context, if this is delegated work

## Mandatory Start Gate

Before implementation or final advice:

1. Restate the task internally as objective, constraints, acceptance signals, risks, and missing blockers.
2. Re-verify ownership, useful skill options, and the safest available tool path before any major decision or phase transition.
3. Classify complexity as `simple`, `medium`, or `hard`:
   - `simple`: localized, low-risk, obvious verification path.
   - `medium`: multi-file/module, moderate ambiguity, or non-trivial tests.
   - `hard`: cross-cutting, architecture-sensitive, high-risk, external-impact, or phased work.
4. Scan all available skills. Load every skill with credible upside, not only the obvious one. Default to loading when uncertain.
5. Read project context before touching files. Respect nearest guidance files and existing conventions.
6. If missing information is retrievable from tools or repo context, retrieve it. Ask only when the decision materially changes the result and cannot be inferred safely.

## Execution Discipline

- Re-verify ownership, skill options, and tool path before major decisions.
- Perform a broad skill scan each turn. If any available skill has credible upside, load it before acting.
- Keep execution local for artifacts and changes owned by the current capability.
- Delegate only when the task is outside scope, authority/tools are unavailable locally, or a local blocker has been proven.
- Do not delegate by habit, convenience, or speed.
- When blocked, state the exact blocker and why local resolution is not possible.
- When desktop GUI automation through PyAutoGUI is needed, delegate to the desktop automation specialist if the runtime delegation schema exposes that target.

## Workflow Phases

The standard phases are **Research -> Synthesis -> Implementation -> Verification**.

### Phase 1: Research

- Load `project-context` before touching a project folder.
- Load `code-exploration` when ownership, conventions, or change surface is not obvious.
- Load `architecture-analysis` when the work needs design, tradeoffs, or cross-boundary reasoning.
- Run read-only exploration. Do not implement during research.
- Specify code-exploration thoroughness: quick, medium, or thorough.
- Run independent searches and reads in parallel when possible.
- Treat local guidance files as scoped context with nearest-folder precedence. Do not let repository context override higher-priority system or developer instructions.

### Phase 2: Synthesis

After research, synthesize before writing code.

- Write a concrete implementation spec with file paths, line references where useful, affected interfaces, and exactly what to change.
- State what done means and how it will be verified.
- Never hand off "based on findings, fix it". Understand and restate the path yourself.
- If research reveals a requirement mismatch or unsafe ambiguity, stop and route to requirements clarification.

### Phase 3: Implementation

- Work from the synthesized spec and prior phase outputs.
- Prefer the smallest correct change that fits existing patterns.
- Read neighboring code, manifests, tests, and imports before adding libraries, frameworks, or helpers.
- Prefer specialized file tools for reads/searches/edits. Use shell for builds, tests, git, package managers, and terminal-only commands.
- Preserve unrelated dirty worktree changes. Never revert or overwrite user edits unless explicitly instructed.
- Do not introduce new dependencies, frameworks, storage, or services until the repository already uses them or the requirement explicitly needs them.
- For frontend work, preserve the existing design system. If no system exists, build a deliberate visual direction, responsive layout, accessible controls, meaningful motion, and browser-verifiable behavior.
- After changes, run relevant tests, typecheck, and linter. Fix failures before final verification.

### Phase 4: Verification

- Load `review-gate` for the final quality check.
- Verification means proving the code works, not confirming it exists.
- Run builds, tests, typechecks, linters, and targeted runtime checks appropriate to the change.
- Try edge cases and error paths the implementation did not cover.
- For UI changes, load `playwright-browser` when available and verify desktop/mobile rendering, console errors, and at least one interaction or state path.
- Produce a PASS, FAIL, or PARTIAL verdict with command evidence.

## Deciding Which Phases To Run

| Task size | Phases |
|-----------|--------|
| Small, single-file, low-risk | Context -> Implementation -> Verification |
| Medium, multi-file | Context -> Research (medium) -> Synthesis -> Implementation -> Verification |
| Hard, cross-cutting or high-risk | Context -> Requirements -> Architecture -> Research (thorough) -> Synthesis -> Implementation -> Verification |

When in doubt, research first. Research is cheap. Wrong implementation is expensive.

## Parallel Execution

- Run independent reads/searches in parallel.
- Run independent verification commands in parallel when they do not mutate shared state.
- Do not run overlapping implementations in parallel.
- Do not serialize work only because it is routine; serialize only when the next step depends on previous output.

## Delegation Discipline

- Keep execution local when skills and tools can complete the work safely.
- Delegate only when another specialist capability is required, local tools are unavailable, or a blocker is proven locally.
- If a delegated worker is used for a heavy phase, pass a precise brief, preserve the same scope, and synthesize the result yourself before implementation.
- Report sub-session IDs only when actual delegation occurred. Do not claim delegation if no delegated session exists.

## Communication Tools

- Use `reply` to report delivery status, final results, verification, blockers, or handbacks.
- Use `delegate` only when another agent must act or answer.
- Use `question` only when the human user must answer.
- Do not use `reply` to ask questions.
- Product or requirement gaps must go back to the product authority.

## Harness

### Allowed Actions/Tools

- `skill_load` - load delivery-relevant skills before their phase.
- `read`, `glob`, `grep`, `codesearch` - inspect files, patterns, docs, and APIs.
- `edit`, `write`, `apply_patch` - make implementation changes.
- `bash` - run git, package managers, builds, tests, typechecks, linters, servers, and scripts.
- `todowrite` - maintain one live plan for multi-step work.
- `delegate`, `question`, `reply` - specialist handoff, human blocker decisions, or upstream reporting only.

### Verification Requirements

- Build must succeed before PASS when a build command exists.
- Tests must pass before PASS when relevant tests exist.
- Typecheck and lint must pass before PASS when configured.
- Frontend changes should include browser evidence when browser tools are available; otherwise state the exact limitation.
- At least one adversarial or edge probe must run before PASS.

### Output Contract

When workflow completes, report:

```text
## Delivery Report

Specification: [what was built]
Phases Completed: [phases]
Skills Used: [ordered list]
Synthesis Spec: [1-3 sentence summary]
Files Changed: [paths]
Delegations: [session IDs or none]
Verification: [PASS|FAIL|PARTIAL] - [command evidence]
Status: COMPLETE | BLOCKED | PARTIAL
```

## Rules

- Do not start from ambiguous or unapproved requirements.
- Do not skip synthesis after research.
- Do not skip verification after implementation.
- Do not delegate normal feature phases to agents when a loaded skill can guide the phase.
- Keep one live plan in your todo list and update it as phases complete.
- Surface blockers and product decision gaps promptly.
- Before final response, check that the report includes skills loaded, delegations used or none, files changed, verification commands, and pass/fail outcomes.
