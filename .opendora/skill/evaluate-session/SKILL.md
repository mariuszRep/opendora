---
name: evaluate-session
description: Read-only retrospective on a session. Audits efficiency, identifies failed and redundant tool calls, surfaces step bloat and routing errors, and produces actionable improvement recommendations. Foundation for workflow automation — once a session has been evaluated and cleaned up, the manage-workflow skill can lift the corrected step chain into a reusable workflow.
origin: opendora
---

# Session Evaluation Skill

Retrospective audit of a session. Read-only. Never mutates session state — for that, use `manage-session`.

## When to use

- "evaluate session", "session retrospective", "session audit", "what went wrong with session X"
- Before lifting a session into a reusable workflow (paired with `manage-workflow`)
- After a multi-step task to find waste and failures

## Tools in scope

The two foundational tools form a deliberate pair: **analyze first, then fetch only what you need.**

- `session_analyze` — **call first**. Returns the full structural map: message/tool counts, tools_used frequency, **failure stats** (failed_tool_calls, interrupted_tool_calls, tools_failed, error_step_indices), and a flat `chain` array where every step has a `step` index, `message_id`, `part_id`, `tool`, `call_id`, and `tool_status`. **No text content** — purely structural.
- `session_get` — **call after analyze, with precise filters**. Modes (chosen by the params you pass):
  - `step_indices: [...]` → fetch native content for those exact steps
  - `call_ids: [...]` → fetch specific tool calls; combine with `tool_data: "input" | "output" | "both"`
  - `tool_names: [...]` → fetch all calls of those tools (e.g. all `webfetch`); combine with `tool_data`
  - `message_ids: [...]` → fetch full messages
  - no filter → full conversation in agent format (use `message_limit` for the most recent N)
- `session_tree` — only when the session has children/parents and the audit covers the whole tree.
- `session_search` — only to resolve a label/prefix to a session id when no id is given.
- `log` — silent advisory log when something genuinely needs follow-up (see Logging below).

**Do not** load a session's full transcript into your context unless you need it. The whole point of `session_analyze` + filtered `session_get` is to keep context small.

## Variables

- `{{session_id}}` — target session, or root of a tree retrospective.
- `{{scope}}` — `single` (one session, default) or `tree` (root + descendants).
- `{{goal}}` — `efficiency` | `failures` | `delegation` | `quality` | free-form. Defaults to `efficiency`.

## Workflow

### 1. Resolve the target

If given a label or prefix instead of an id, use `session_search` once to pick the matching session.

### 2. Map the structure (always start here)

Call `session_analyze(session_id)`. From the response, capture:

- `summary.total_steps`, `total_tool_calls`, `failed_tool_calls`, `interrupted_tool_calls`
- `summary.tools_used` (frequency map) and `summary.tools_failed` (per-tool error counts)
- `summary.error_step_indices` and `summary.interrupted_step_indices`
- `chain` — keep this in working memory; every later `session_get` references its `step` indices

If `scope` is `tree`, also call `session_tree(session_id, include_stats: true)` and run step 2 on each node.

### 3. Investigate failures (highest priority)

For every step in `error_step_indices`:

```
session_get(session_id, step_indices: [<error step>], tool_data: "both")
```

This returns the failing tool call's input AND error message in one shot. For each failure, identify:

- **Root cause class**: bad parameter, missing parameter, wrong tool for the task, permission denied, network/IO, schema mismatch, incorrect path, agent hallucination.
- **Whether it was retried**: scan the chain after the failed step for a same-tool call.
- **Whether it cascaded**: did the failure block subsequent useful work?

For interrupted calls, do the same with `interrupted_step_indices`.

### 4. Detect inefficiencies

Use the chain + tool counts to spot patterns. Fetch evidence only when needed.

| Pattern | Detection from analyze | Evidence fetch |
|---|---|---|
| Redundant reads | `tools_used.read` very high relative to unique files | `session_get(tool_names: ["read"], tool_data: "input")` to see paths |
| Redundant fetches | `tools_used.webfetch` high, look at duplicate inputs | `session_get(tool_names: ["webfetch"], tool_data: "input")` |
| Failed-then-retried bloat | error step followed by same-tool calls | already have it from step 3 |
| Reasoning bloat | many `reasoning` steps between tool calls without progress | `session_get(step_indices: [...], )` for spot-check |
| Tool-for-the-wrong-job | e.g. `bash` used to read a file when `read` exists | inspect the call's input/output |
| Missing verification | edits/writes never followed by a read or test | tool_calls sequence in chain |
| Step bloat | `total_steps` very high relative to user_messages | summary level |
| Idle delegations | `delegate` calls that produced little output downstream (tree mode) | child session_analyze |
| Ghost claims | assistant_text steps claim work was done but no matching tool_call follows | spot-check via `session_get(step_indices: [...])` |

For each pattern: list **affected step indices**, **frequency**, **estimated cost** (steps wasted, tokens approx).

### 5. Produce the report

```
# Session Retrospective — {session_id}

Title:        {title}
Agent:        {agentId}
Goal of run:  (inferred from first user_message)
Audit goal:   {goal}

## Snapshot

Total steps:           {N}
Total tool calls:      {N}   (failed: {F}, interrupted: {I})
Unique tools used:     {N}
Most-used tools:       {top 3 from tools_used}
Tools that failed:     {tools_failed map, or "none"}

## Failures

{For each failed step:}
- step {N} · {tool} · status: error
  - input:  (one-liner extracted from session_get input)
  - error:  (extracted error)
  - cause:  {root cause class}
  - retried: {yes/no, where}
  - cascaded: {yes/no, what blocked}

## Inefficiencies

{For each pattern detected, sorted by impact:}
1. {pattern} — {affected steps} — est. {N} wasted steps / {N} tokens
   Evidence: step indices {[...]}
   Fix:      {persona rule, parameter discipline, alt tool, restructure}

## Recommendations (sorted by impact)

1. {fix} → est. saving {N steps / N tokens}
2. ...

## Workflow-readiness

Cleaned step chain (after removing failures/redundancy): {N} steps
Candidate to lift into workflow via manage-workflow: {yes/no, with notes on what must be parameterized}
```

### 6. Logging (silent, only on real findings)

Only log when there is something a human or another agent needs to act on. Do not narrate logging.

- Tool/skill failure during the audit itself: `log(target_type=skill, target_id=evaluate-session, kind=error, message=<what failed>, context=<session_id>)`
- Per significant inefficiency (top 3 max): `log(target_type=agent, target_id=<agent that caused it>, kind=advisory, message=<pattern + step indices + estimated cost>, context=<session_id>)`
- Per clear agent bug (e.g. ghost claim, repeated same-error retry without recovery): `log(target_type=agent, target_id=<that agent>, kind=bug, message=<what happened>, context=<session_id>)`

Never log a clean session.

If anything was logged, append a single line to the report: `Logged: N entries`.

## Rules

- **Read-only.** Never call `session_update`, `delegate`, or any mutating tool from this skill.
- **Analyze first, fetch second.** Never call `session_get` without filters unless the session has fewer than ~20 steps.
- **One filter mode per `session_get` call.** Don't combine `step_indices` with `tool_names`.
- **Quote concrete evidence.** Every finding cites step indices, call IDs, or message IDs from `session_analyze`.
- **No edits, no agent updates, no commits.** If a fix is warranted, recommend it; don't apply it.
- **Tree mode**: traverse via `session_tree`, then run analyze on each child. Roll up failures and inefficiencies at the tree level.
- **Pair with downstream skills**:
  - `manage-session` — to actually rename/archive/reparent based on findings
  - `manage-workflow` — to lift the cleaned step chain into a reusable workflow
  - `agent-ops` — to run experiments fixing the top recommendation

## Hand-off to manage-workflow

When the user asks "turn this session into a workflow" after an evaluation:

1. The cleaned step chain (failures and redundant calls removed) is the candidate.
2. Identify which inputs are session-specific (must become workflow parameters) vs. constant.
3. Note any branches/conditionals (failed → retried with different input) that need to become workflow logic.
4. Hand off the chain + parameterization notes to `manage-workflow`.
