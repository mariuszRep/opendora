---
name: experiment
description: Run a structured improvement experiment on any agent — test and improve persona, injection, tools, skills, or delegation behaviour; supports short Q&A and full end-to-end workflow sessions; tracks tokens and steps per run; keep or discard the change; log every experiment
---

# Experiment — Agent Improvement Skill

You are running one improvement experiment. This skill is driven by a **campaign brief** — read it carefully before starting. The brief defines the target, the goal, and optionally the scope and test approach. Everything else you derive from that brief.

## Campaign Variables

The session prompt will give you:

- **target** — agent ID to improve (e.g. `pandora`, `pm`, `agent-owner`)
- **goal** — what behaviour to improve (e.g. "always delegates by intent, not by name", "avoids redundant reads before acting")
- **scope** — what artifact to change: `persona`, `injection`, `tools`, `skills`, or `auto` (detect from goal)
- **test_mode** — how to test: `questions` (short Q&A probes), `workflow` (full end-to-end task session), or `auto` (infer from goal)
- **test_brief** — description of what a successful run looks like (optional; derive if not given)

If `target` or `goal` is missing, ask before proceeding. All other variables can be inferred.

---

## Experiment ID

Generate a short ID at the start: `exp-{target}-{YYYYMMDD}-{N}` (increment N if running multiple today).
Use this ID to label every sub-session spawned during this experiment.

---

## Steps

### 1. Read current state

- `agent_get` the target agent config
- `read` its `PERSONA.md`
- `read` its `INJECTION.md` if `enableInjection: true`
- `read` `.opendora/skill/improve/log.md` if it exists — use past entries as context to avoid repeating known failures
- Note the full current state before making any changes

### 2. Determine test scenario

**If `test_mode` is `questions` or the goal is about delegation routing, decision behaviour, or short-form correctness:**
- Derive 5 short test prompts that directly probe the goal
- Write them out in full before starting — they must be identical for baseline and post-change runs

**If `test_mode` is `workflow` or the goal is about multi-step behaviour, efficiency, end-to-end quality, or tool usage patterns:**
- Design one representative task that exercises the full capability being improved
- Describe the task explicitly — what the agent should do, what a correct outcome looks like

State the test scenario and why it covers the goal before running anything.

### 3. Run baseline

For each test question or the workflow task:
- `delegate` to the target agent in a fresh sub-session
- Label each session: `{experiment_id}/baseline/{n}`
- After the session completes, use `session_get` to retrieve token data

Record all baseline results as a table:

```
| Test | What the agent did | Correct? | Input tokens | Output tokens | Steps (tool calls) |
```

For `workflow` mode, record: what the agent did, which agents it delegated to, what tools it called, what skills it loaded, and whether the outcome was correct.

### 4. Baseline assessment

Summarise:
- The behaviour pattern the baseline reveals
- The specific failure or inefficiency (if any)
- Whether baseline is already at 100% correct — if so, state it and stop; no change needed

### 5. Propose one change

Based on the goal, failure pattern, log history, and scope:

- Identify exactly **which artifact** to change: `PERSONA.md`, `INJECTION.md`, tools list, or a skill's `SKILL.md`
- Propose **one targeted change**
- The change must:
  - Be expressed as a behavioural rule or capability statement — never an agent name
  - Be minimal — prefer adding one sentence over rewriting a section
  - Not contradict or break other documented behaviours in the same artifact
  - Avoid any pattern already marked as a known failure in the log

State the proposed change explicitly and which file it will modify before applying it.

### 6. Apply the change

Apply exactly one change using the appropriate tool:

- **PERSONA.md** or **SKILL.md**: use `edit` on the file directly
- **INJECTION.md**: use `edit`, or create the file if it doesn't exist (first run `agent_update` with `enableInjection: true`)
- **Tools list**: use `agent_update` with the updated `tools` array

Do not touch anything else.

### 7. Run post-change

Run the exact same tests as Step 3, in the same order, each in a fresh sub-session.
Label each session: `{experiment_id}/post/{n}`

Record results in the same table format as Step 3.

### 8. Compare

Side-by-side comparison:

- How many tests improved, regressed, or stayed the same?
- Token delta: did the change reduce or increase total input/output tokens?
- Step delta: did the change reduce or increase tool call count per session?
- Did the change move behaviour toward the goal?

State a clear verdict: **KEEP** or **DISCARD**

### 9. Keep or discard

**If KEEP:**
- Leave the change in place
- Commit: `git add <changed file> && git commit -m "experiment(<target>): <one line — what changed and why>"`
- Append to `.opendora/skill/improve/log.md` (see Log Format below)

**If DISCARD:**
- Revert the change with `edit`, restoring the original content exactly
- Append to `.opendora/skill/improve/log.md` with outcome DISCARD

### 10. Report

Output a concise experiment summary:

```
Experiment:  {experiment_id}
Target:      {agent_id}
Goal:        {goal}
Scope:       {persona | injection | tools | skills}
Change:      {what was changed, one line}

Baseline:    {X/N correct} | {total input tokens} in | {total output tokens} out | {total steps}
Post:        {X/N correct} | {total input tokens} in | {total output tokens} out | {total steps}
Delta:       {+/-N correct} | {+/-N% tokens} | {+/-N steps}

Decision:    KEEP / DISCARD
Reason:      {one sentence}
```

---

## Log Format

Append one entry per experiment to `.opendora/skill/improve/log.md`:

```markdown
### {experiment_id} — {YYYY-MM-DD}

- **Target**: {agent_id}
- **Goal**: {goal}
- **Scope**: {persona | injection | tools | skills}
- **Change**: {what was changed}
- **Baseline**: {X/N} | {input tokens} in / {output tokens} out | {steps} steps
- **Post**: {X/N} | {input tokens} in / {output tokens} out | {steps} steps
- **Decision**: KEEP / DISCARD
- **Lesson**: {one sentence — what worked or what failed and why}
```

---

## Background Logging

Call `log` silently only when something goes wrong or needs attention — do not narrate these calls, do not log successes:

- **When a test sub-session errors or produces no output**: `log(target_type=agent, target_id=<target>, kind=error, message=<what failed>, context=<experiment_id>)`
- **When a delegation or tool call fails inside a test run**: `log(target_type=agent, target_id=<target>, kind=bug, message=<wrong behaviour observed>, context=<experiment_id>)`
- **When a DISCARD decision is made**: `log(target_type=agent, target_id=<target>, kind=failed, message=<what was tried and why it failed>, context=<experiment_id>)`
- **When tokens are unexpectedly high or step count is wasteful**: `log(target_type=agent, target_id=<target>, kind=advisory, message=<what the pattern is and why it matters>, context=<experiment_id>)`

Do NOT log KEEP decisions, correct baselines, or "no change needed" outcomes — those are not problems.

At the end of the experiment report, if any log entries were written, append one line:

```
Logged: N entries → .opendora/agents/{target}/LOG.md
```

If nothing was logged, omit this line entirely.

---

## Rules

- One change per experiment — never stack multiple changes in one run
- Never refer to agents by name in persona or injection instructions — use capability descriptions
- Always use fresh sub-sessions for every test — never reuse a session across baseline and post
- Always label sub-sessions with the experiment ID so they can be found later
- Always read the log before proposing a change — never repeat a known failure
- If the goal is about delegation or routing → use `questions` mode
- If the goal is about efficiency, workflow quality, or multi-step behaviour → use `workflow` mode
- If baseline is already 100% correct, report it and stop — no change needed
- The `retro` skill can be run on any baseline or post session to get a deeper breakdown of steps, tool calls, and token distribution — use it when the behaviour is surprising or the token delta is large
