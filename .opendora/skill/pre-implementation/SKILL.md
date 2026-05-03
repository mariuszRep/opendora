---
name: pre-implementation
description: Load before coding to explore the codebase and produce an implementation-ready technical design. Phase 1 finds relevant files and boundaries (read-only exploration). Phase 2 turns bounded requirements into a concrete implementation approach with affected areas, tradeoffs, and step-by-step strategy.
---

# Pre-Implementation

Use this skill when approved work needs codebase understanding and technical planning before implementation. Run both phases in sequence before writing any code.

## READ-ONLY MODE

Both phases are read-only. Do not create, edit, move, or delete files. Do not run state-changing commands. Allowed: ls, cat, head, tail, git log, git diff, find, grep, read, glob.

---

## Phase 1: Explore

Find the relevant files, modules, and boundaries for the task.

### Thoroughness Levels

Caller specifies a level. Default to **medium** when not specified.

- **quick** — locate the primary owner file and 2–3 most relevant symbols. Stop once the entry point is clear.
- **medium** — trace ownership chain, find related files and interfaces, identify likely change surface.
- **thorough** — exhaustive multi-angle search: naming conventions, tests, config, migration files, type boundaries, and usage sites. Use when scope is broad or risk is high.

### Steps

1. Identify the package, app, or directory likely to own the behavior.
2. Launch parallel searches across multiple angles simultaneously:
   - file name patterns and directory structure
   - symbol, function, or class name
   - string content, route path, or config key
3. Read enough context around matches to understand how pieces connect. Avoid shallow surface matches.
4. Narrow to files and interfaces most likely to change.
5. Summarize findings as input for Phase 2.

Batch independent searches into a single round. Only wait for one search before starting another when the next depends on what the first found.

### Phase 1 Output

```
## Exploration Results

**Search Strategy:** [quick|medium|thorough]

**Files Found:**
- [path/to/file1.ts] — owning module/feature
- [path/to/file2.ts]

**Ownership Chain:**
- [how pieces connect]

**Likely Change Surface:**
- [files/modules to modify]
- [specific interfaces/entry points]

**Risks/Assumptions:**
- [open risks or unknowns]
```

---

## Phase 2: Design

Turn exploration findings into an implementation-ready technical approach.

### Steps

1. Read the bounded request and Phase 1 findings.
2. Find existing patterns and conventions for the type of change. Identify similar features as reference.
3. Define exact change boundaries: files, modules, APIs, schemas, state, or user flows.
4. Recommend an implementation approach that fits existing architecture and patterns.
5. Identify dependencies and sequencing — what must happen first, what can run in parallel.
6. Anticipate challenges and call out open risks or decisions.
7. Hand back an implementation-ready design summary.

### Rules

- Work from bounded requirements, not guesses.
- Prefer the simplest approach that fits existing patterns.
- Make tradeoffs explicit when multiple paths are viable.
- Include specific file paths, line numbers, and type signatures — not abstract descriptions.
- Do not drift into implementation unless explicitly in implementation phase.
- If the request is too ambiguous for safe design, state the blocking ambiguity clearly.

### Phase 2 Output

Provide all of:

- scope and affected areas
- recommended approach with rationale
- step-by-step implementation strategy
- risks, tradeoffs, and dependencies
- open decisions or blockers

End with:

### Critical Files for Implementation
List 3–6 files most critical for implementing this plan:
- `path/to/file1.ts`
- `path/to/file2.ts`

---

## Rules

- Phase 1 feeds Phase 2 — complete exploration before design.
- Stay grounded in code that actually exists. No assumptions.
- Prefer concrete file paths, line references, and ownership boundaries over abstract summaries.
- Stop exploring once the change surface is clear enough to act.
- State exactly what still needs checking if uncertainty remains.
