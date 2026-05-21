---
name: evaluate-session
description: Evaluate session quality, execution efficiency, and routing correctness using session history evidence. Full retrospective mode traces the delegation tree, computes token and step costs, surfaces inefficiencies, and recommends targeted improvements. Use for session audits, workflow quality checks, and session retrospectives.
origin: opendora
---

# Session Evaluation Skill

Use this skill when you need to evaluate whether a session was executed correctly, efficiently, and with proper routing — or when conducting a full retrospective across an entire delegation tree.

## Alias Triggers

- "session eval"
- "evaluate session"
- "session audit"
- "workflow quality check"
- "session retrospective"
- "efficiency audit"

## Objective

- Assess session quality against explicit criteria.
- Identify routing errors, wasted steps, and missing verification.
- Produce actionable remediation guidance.
- For full retrospectives: trace the complete delegation tree, compute token and step costs, and recommend targeted improvements.

## Variables

- `{{session_id}}` — target session or root session for a full tree retrospective.
- `{{criteria}}` — quality dimensions and pass conditions.
- `{{scope}}` — `quick` (single session audit) or `full` (complete delegation tree retrospective).
- `{{goal}}` — what to optimize for in full mode: `efficiency`, `delegation`, `quality`, or free-form.
- `{{depth}}` — how deep to traverse the delegation tree in full mode (default: full tree).

---

## Quick Audit Mode

Use when evaluating a single session or a bounded subtree.

### Steps

1. Load session context using `session_get` and `session_tree`.
2. Score behavior against criteria.
3. Flag routing, tool-selection, and verification failures.
4. Quantify waste indicators (extra steps, repeated work).
5. Report pass/fail and improvement actions.

### Rules

- Ground findings in concrete message/tool evidence.
- Distinguish hard-rule violations from soft optimization opportunities.
- When evaluating subtree scope, include all descendants.

---

## Full Retrospective Mode

Use when given a root session ID or experiment label prefix and asked for a full retrospective. This mode walks the complete delegation chain, computes costs, and generates ranked recommendations.

This mode is **read-only and analytical** — it makes no changes.

### Steps

#### 1. Find the Root Session

- If given a full session ID: `session_get` it directly.
- If given a label or prefix: `session_search` to find matching sessions; pick the most relevant root.
- Confirm the session exists before continuing.

#### 2. Build the Session Tree

Starting from the root, build the full tree recursively:

1. `session_tree(root_id, include_stats: true)` — get full tree with message and tool call counts per node.
2. For each node needing detail: `session_get(child_id, include_tool_calls: true)`.

Render the tree as you build it:

```
root (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens — {T} tool calls
├── child-1 (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens — {T} tool calls
│   └── grandchild-1 (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens — {T} tool calls
└── child-2 (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens — {T} tool calls
```

#### 3. Analyse Each Session Node

For each session, use `session_get(id, include_tool_calls: true)`:

**Tool call breakdown** from the tool_calls array:
```
delegate: N  reply: N  read: N  write: N  edit: N  bash: N  session_get: N  skill_load: N  ...
```

**Delegation chain:** which agent was targeted, whether `wait: true/false` was used, whether a reply was received.

**Token breakdown:** inputTokens, outputTokens, cacheReadTokens from session metadata.

#### 4. Build the Summary Table

| Session label | Agent | Depth | Steps | Input tokens | Output tokens | Skills loaded | Delegations out | Tool calls |
|---|---|---|---|---|---|---|---|---|
| root | ... | 0 | N | X | Y | [...] | N | [...] |
| child-1 | ... | 1 | N | X | Y | [...] | N | [...] |
| **TOTAL** | | | **N** | **X** | **Y** | | **N** | **[...]** |

#### 5. Identify Inefficiencies

Look for:

- **Redundant reads** — same file or resource read multiple times across the tree.
- **Delegation overhead** — sessions spawning children for tasks within their own capability.
- **Step bloat** — sessions with high step count relative to output.
- **Skill reload** — same skill loaded more than once within the same tree.
- **Token imbalance** — input tokens very high relative to output (reading too broadly before acting).
- **Deep chains for shallow work** — tasks travelling to grandchild depth when child level sufficed.
- **Idle delegations** — delegate calls where the delegated session produced minimal output.
- **Ghost delegations** — agent claims to have delegated but no delegate tool call exists.
- **Missing replies** — delegated to another agent but no reply tool called in child session.
- **Message bloat** — excessive thinking/reasoning text without corresponding tool calls.

For each inefficiency: which session(s), estimated token/step cost, frequency.

#### 6. Generate Recommendations

For each inefficiency:

- **Name the pattern** (e.g. "redundant read", "step bloat in child-1")
- **Show the evidence** — which session, how many occurrences, estimated cost
- **State the fix** — persona rule, injection hint, workflow restructure, or experiment target
- **Estimate the saving** — tokens or steps reduced if the fix is applied

Sort by estimated impact, highest first.

#### 7. Report

```
Retrospective: {session_id or experiment label}
Goal:          {efficiency | delegation | quality | ...}
Date:          {YYYY-MM-DD}

## Session Tree

{tree diagram from Step 2}

## Summary Table

{table from Step 4}

## Total Cost

Input tokens:  {N}
Output tokens: {N}
Cache reads:   {N}  (if available)
Total steps:   {N}
Deepest chain: depth {N}  ({N} sessions total)

## Inefficiencies Found

1. {pattern name} — {sessions affected} — {estimated cost}
2. ...

## Recommendations

1. {fix description} → estimated saving: {N} tokens / {N} steps → suggested experiment target: {artifact}
2. ...
```

After the report, ask: "Would you like me to run an `agent-ops` experiment targeting the top recommendation?"

### Background Logging

Call `log` silently only for problems — do not narrate:

- **When session_get or session_search fails**: `log(target_type=skill, target_id=session-eval, kind=error, message=<what failed>, context=<session_id>)`
- **For each significant inefficiency found** (top 3 max): `log(target_type=agent, target_id=<agent that caused it>, kind=advisory, message=<pattern + evidence + estimated cost>, context=<session_id>)`
- **When an agent shows clearly wrong behavior**: `log(target_type=agent, target_id=<that agent>, kind=bug, message=<what happened>, context=<session_id>)`

Do NOT log sessions that look clean, reasonable token counts, or observations that don't require follow-up.

If any log entries were written, append: `Logged: N entries → agent and skill LOG.md files`

### Rules

- Build the full tree before analysing — partial trees lead to incomplete conclusions.
- Use `session_tree(id, include_stats: true)` for fast tree building.
- Use `session_get(id, include_tool_calls: true)` for exact tool calls.
- Token data comes from session metadata, not from counting message text.
- If a session has no token data, note it as "tokens not recorded" and continue.
- If the tree has more than 20 sessions, summarise at the agent level rather than per-session.
- This mode is read-only — no edits, no agent updates, no commits.
- Pair with `agent-ops`: retro reveals where to experiment; agent-ops makes the change.