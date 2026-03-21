---
name: retro
description: End-to-end retrospective on any session tree — reconstruct the full delegation chain, surface every step and tool call, tally token costs per node, identify waste, and generate ranked recommendations; designed to work alongside the experiment skill
---

# Retro — Session Retrospective Skill

You are conducting a retrospective on a session tree. Given a root session (or experiment label prefix), you walk the full delegation chain, surface every step and tool call at every level, compute costs, and generate actionable recommendations.

This skill is **read-only and analytical** — it makes no changes. Its job is to surface what happened and where to improve. After generating recommendations, offer to trigger an `experiment` run targeting the top finding.

## Campaign Variables

The session prompt will give you:

- **session_id** — root session ID, or an experiment label prefix (e.g. `exp-pandora-20260321-1/baseline`)
- **goal** — what to optimise for: `efficiency` (fewer steps/tokens), `delegation` (correct routing), `quality` (output correctness), or a free-form description
- **depth** — how deep to traverse the delegation tree (default: full tree)

If `session_id` is not given, ask for it before proceeding.

---

## Steps

### 1. Find the root session

- If given a full session ID: `session_get` it directly
- If given a label or prefix: `session_search` to find matching sessions; pick the most relevant root
- Confirm the session exists and is the intended starting point before continuing

### 2. Build the session tree

Starting from the root, build the full tree recursively:

1. `session_get` the current session — record: id, label, agentId, inputTokens, outputTokens, message count, spawnDepth
2. `session_search` for child sessions where `parentSessionId` = current session id
3. For each child, repeat until no more children or depth limit reached

Render the tree as you build it:

```
root (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens
├── child-1 (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens
│   └── grandchild-1 (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens
└── child-2 (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens
```

### 3. Analyse each session node

For each session, load its messages via `session_get` and extract the following from message parts:

**Step count**: total number of tool call invocations (each tool invocation = 1 step)

**Tool call breakdown** — tally by tool name:
```
read: N  write: N  edit: N  bash: N  delegate: N  session_get: N  skill_load: N  agent_get: N  ...
```

**Skills loaded**: list every `skill_load` call and which skill was loaded

**Delegation calls**: list every `delegate` call — which agent was targeted, and a one-line summary of the prompt

**Token breakdown**: from session metadata — inputTokens, outputTokens, cacheReadTokens (if available)

Record all of this per session node.

### 4. Build the summary table

| Session label | Agent | Depth | Steps | Input tokens | Output tokens | Skills loaded | Delegations out |
|---------------|-------|-------|-------|-------------|--------------|---------------|-----------------|
| root          | ...   | 0     | N     | X           | Y            | [...]         | N               |
| child-1       | ...   | 1     | N     | X           | Y            | [...]         | N               |
| ...           |       |       |       |             |              |               |                 |
| **TOTAL**     |       |       | **N** | **X**       | **Y**        |               | **N**           |

### 5. Identify inefficiencies

Based on the goal, look for:

**Redundant reads** — the same file or resource read multiple times across the tree (burns input tokens on repeated context)

**Delegation overhead** — sessions that spawn children for tasks within their own capability (adds round-trip latency and tokens)

**Step bloat** — sessions with high step count relative to output (excessive exploration, repeated tool calls before acting)

**Skill reload** — the same skill loaded more than once within the same tree (suggests the agent doesn't retain loaded content across steps)

**Token imbalance** — sessions where input tokens are very high relative to output (reading too broadly before acting)

**Deep chains for shallow work** — tasks that travelled to grandchild depth when child level would have sufficed

**Idle delegations** — delegate calls where the delegated session produced minimal output or no useful result

For each inefficiency found, note: which session(s) it appears in, how many tokens or steps it costs, and how often it occurs across the tree.

### 6. Generate recommendations

For each inefficiency, produce one recommendation:

- **Name the pattern** (e.g. "redundant read", "step bloat in child-1")
- **Show the evidence** — which session, how many occurrences, estimated cost
- **State the fix** — a concrete change: a persona rule, an injection hint, a workflow restructure, or an experiment target
- **Estimate the saving** — tokens saved or steps reduced if the fix is applied

Sort recommendations by estimated impact, highest first.

### 7. Report

Output a structured retrospective:

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

After the report, ask: "Would you like me to run an `experiment` targeting the top recommendation?"

---

## Background Logging

Call `log` silently only for problems — do not narrate these calls, do not log clean runs:

- **When session_get or session_search fails**: `log(target_type=skill, target_id=retro, kind=error, message=<what failed>, context=<session_id>)`
- **For each significant inefficiency found** (top 3 max): `log(target_type=agent, target_id=<agent that caused it>, kind=advisory, message=<pattern + evidence + estimated cost>, context=<session_id>)`
- **When an agent shows clearly wrong behaviour** (e.g. delegated something it should handle itself): `log(target_type=agent, target_id=<that agent>, kind=bug, message=<what happened>, context=<session_id>)`

Do NOT log sessions that look clean, token counts that are reasonable, or any observation that doesn't require follow-up action.

At the end of the report, if any log entries were written, append one line:

```
Logged: N entries → agent and skill LOG.md files
```

If nothing was logged, omit this line entirely.

---

## Rules

- Build the full tree before analysing — partial trees lead to incomplete or misleading conclusions
- Token data comes from session metadata, not from counting message text
- Step counts come from tool invocation parts in messages, not from message count
- This skill is read-only — it produces no edits, no agent updates, no commits
- If a session has no token data, note it as "tokens not recorded" and continue
- If the tree has more than 20 sessions, summarise at the agent-level rather than per-session to keep the report readable
- Pair with `experiment`: retro reveals where to experiment; experiment makes the change and measures it
