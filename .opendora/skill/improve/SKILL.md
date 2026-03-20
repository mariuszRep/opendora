---
name: improve
description: Run a single prompt improvement experiment on a target agent — adjust its PERSONA, test delegation behaviour, compare results, keep or discard the change
---

# Improve — Prompt Experiment Skill

You are running one improvement experiment on a target agent. This skill tells you exactly what to do, step by step.

## Variables

At the start of the session you will be given:

- **target_agent** — the agent ID whose PERSONA.md you will modify
- **improvement_goal** — what behaviour you are trying to improve (e.g. "always delegate to the correct agent based on intent, without relying on agent names")

If either variable is missing, ask for it before proceeding.

---

## Steps

### 1. Read current state

- Use `agent_get` to load the target agent's config
- Use `read` to load its `PERSONA.md`
- Use `read` to load `.opendora/skill/improve/lessons.md` if it exists — use it as context for this run
- Note the current state clearly before making any changes

### 2. Run baseline questions

Run the target agent against the baseline questions below. For each question:

- Use `delegate` to send the question to the target agent in an isolated sub-session
- Record which agent it delegated to (or whether it handled it itself)
- Do this for every question — one sub-session per question

If the campaign prompt includes explicit test questions, use those. Otherwise derive 5 short, ambiguous questions yourself that test the improvement goal — write them out before starting the runs so they are fixed for both baseline and post-change.

Record all results as: `question → actual delegation choice`

### 3. Propose one change

Based on the baseline results and the improvement goal:

- Identify the specific failure pattern (e.g. wrong agent chosen, handled directly when should delegate)
- Propose **one small, targeted change** to the PERSONA.md
- The change must:
  - Be expressed as a behavioural rule, not an agent name
  - Not break other behaviours described in the persona
  - Be minimal — prefer adding one sentence over rewriting a section

State the proposed change explicitly before applying it.

### 4. Apply the change

- Use `edit` to apply the change to the target agent's PERSONA.md
- Do not change anything else

### 5. Run post-change questions

Run the exact same questions as Step 2, in the same order, each in a fresh sub-session.

Record all results as: `question → actual delegation choice`

### 6. Compare

Compare baseline results vs post-change results:

- How many questions improved?
- How many regressed?
- How many stayed the same?
- Did the change move behaviour closer to the improvement goal?

State a clear verdict: **KEEP** or **DISCARD**

### 7. Keep or discard

**If KEEP:**
- Leave the PERSONA.md change in place
- Run `bash` to commit: `git add` the changed PERSONA.md, commit with message: `improve(<target_agent>): <one line describing what changed and why>`
- Update `.opendora/skill/improve/lessons.md` — append one bullet describing what worked

**If DISCARD:**
- Use `edit` to revert the PERSONA.md to its original state
- Update `.opendora/skill/improve/lessons.md` — append one bullet describing what failed and why

### 8. Report

Output a concise experiment summary:

```
Target: <agent id>
Goal: <improvement goal>
Change: <what was changed>
Baseline: X/N questions correct
Post-change: X/N questions correct
Decision: KEEP / DISCARD
Reason: <one sentence>
```

---

## Rules

- One change per experiment — do not stack multiple changes
- Never mention specific agent names in persona instructions — use capability descriptions
- Always use fresh sub-sessions for each test question
- Always read lessons.md before proposing a change — do not repeat known failures
- If the baseline is already 100% correct, report it and stop — no change needed
