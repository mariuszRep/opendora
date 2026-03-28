---
name: retro
description: End-to-end retrospective on any session tree — reconstruct the full delegation chain, surface every step and tool call, tally token costs per node, identify waste, and generate ranked recommendations; designed to work alongside the agent-experiment skill
---

# Retro — Session Retrospective Skill

You are conducting a retrospective on a session tree. Given a root session (or experiment label prefix), you walk the full delegation chain, surface every step and tool call at every level, compute costs, and generate actionable recommendations.

This skill is **read-only and analytical** — it makes no changes. Its job is to surface what happened and where to improve. After generating recommendations, offer to trigger an `agent-experiment` run targeting the top finding.

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

1. `session_tree(root_id, include_stats: true)` — get full tree with message and tool call counts per node
2. For each node, if you need more detail, use `session_get(child_id, include_tool_calls: true)`

Render the tree as you build it:

```
root (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens — {T} tool calls
├── child-1 (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens — {T} tool calls
│   └── grandchild-1 (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens — {T} tool calls
└── child-2 (id) — agent: {agentId} — {N} messages — {X} in / {Y} out tokens — {T} tool calls
```

**Key:** The `include_stats: true` flag gives you messageCount and toolCallCount instantly. Use this instead of counting manually.

### 3. Analyse each session node

For each session, use `session_get(id, include_tool_calls: true)` to get exact tool invocation data:

**Step count**: directly from toolCallCount in stats (or from tool_calls array)

**Tool call breakdown** — from the tool_calls array:
```
delegate: N  reply: N  read: N  write: N  edit: N  bash: N  session_get: N  skill_load: N  agent_get: N  ...
```

**Delegation chain**:
- Which agent was targeted (delegate call)
- Was `wait: true` or `wait: false` used
- Was a reply received back (check child session has reply_to set)

**Token breakdown**: from session metadata — inputTokens, outputTokens, cacheReadTokens (if available)

Record all of this per session node.

### 4. Build the summary table

| Session label | Agent | Depth | Steps | Input tokens | Output tokens | Skills loaded | Delegations out | Tool calls |
|---------------|-------|-------|-------|-------------|--------------|---------------|-----------------|------------|
| root          | ...   | 0     | N     | X           | Y            | [...]         | N               | [...]      |
| child-1       | ...   | 1     | N     | X           | Y            | [...]         | N               | [...]      |
| ...           |       |       |       |             |              |               |                 |            |
| **TOTAL**     |       |       | **N** | **X**       | **Y**        |               | **N**           | **[...]**  |

**Note:** Steps = tool calls. Use `include_tool_calls: true` to get exact counts.

### 5. Identify inefficiencies

Based on the goal, look for:

**Redundant reads** — the same file or resource read multiple times across the tree (burns input tokens on repeated context)

**Delegation overhead** — sessions that spawn children for tasks within their own capability (adds round-trip latency and tokens)

**Step bloat** — sessions with high step count relative to output (excessive exploration, repeated tool calls before acting)

**Skill reload** — the same skill loaded more than once within the same tree (suggests the agent doesn't retain loaded content across steps)

**Token imbalance** — sessions where input tokens are very high relative to output (reading too broadly before acting)

**Deep chains for shallow work** — tasks that travelled to grandchild depth when child level would have sufficed

**Idle delegations** — delegate calls where the delegated session produced minimal output or no useful result

**Ghost delegations** — agent claims to have delegated but the delegate tool was never called (check via include_tool_calls)

**Missing replies** — delegated to another agent but never received a reply back (no reply tool called in child session)

**Reply chain latency** — large time gap between delegation and reply (indicates the flow is broken)

**Message bloat** — messages with excessive thinking/reasoning text without corresponding tool calls (overproduction)

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

After the report, ask: "Would you like me to run an `agent-experiment` targeting the top recommendation?"

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
- Use `session_tree(id, include_stats: true)` for fast tree building — don't manually count messages
- Use `session_get(id, include_tool_calls: true)` to get exact tool calls — don't guess from message content
- Token data comes from session metadata, not from counting message text
- Step counts come from tool call data, not from message count
- This skill is read-only — it produces no edits, no agent updates, no commits
- If a session has no token data, note it as "tokens not recorded" and continue
- If the tree has more than 20 sessions, summarise at the agent-level rather than per-session to keep the report readable
- Pair with `agent-experiment`: retro reveals where to experiment; agent-experiment makes the change and measures it
- **Flow analysis:** trace the delegation → reply chain. If a delegation was made but no reply was received, note it as "missing reply" inefficiency
- **Efficiency check:** if a session has many messages but few/no tool calls, it may be overproducing (excessive thinking text)
