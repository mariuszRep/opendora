---
name: skill-author
description: DEPRECATED. Use skill-ops instead for skill-authoring and skill-creation. This skill is kept for backward compatibility only.
---

# Skill Author (Deprecated)

**This skill has been replaced by `skill-ops`.**

Load `skill-ops` for all skill-authoring, skill-creation, skill-evals, and skill-benchmarking tasks.

## Migration

All functionality has been migrated to:
- **skill-ops** — contains skill-authoring guidance + skill-creator workflow + evaluation tools

Please update any references to use `skill-ops` instead.

## No-Regression Rule

- Preserve important existing workflow and constraints unless the prompt explicitly calls for changing them
- Prefer additive guidance over deleting established instructions
- If a current behavior must change, identify the old behavior, the new behavior, and the validation needed before keeping the change
- Treat the existing skill text as a baseline to compare against, not just a draft to overwrite

## Variables

- `{{skill_name}}` - filesystem and registry name for the skill
- `{{goal}}` - what the skill should help an agent accomplish
- `{{scope}}` - `new`, `rewrite`, or `improve`
- `{{target_users}}` - which kinds of agents should load it

---

## What A Good Skill Does

- Gives an agent a repeatable workflow for a narrow class of work
- Defines what inputs the session prompt should provide
- Tells the agent what to produce, not every tiny thought to think
- Uses rules and decision points to reduce ambiguity
- Stays reusable across many sessions instead of encoding one-off context

## What A Skill Must Avoid

- Hardcoding one specific session's data as if it were permanent
- Over-specifying trivial actions that the base model already handles well
- Naming specific agents, tools, or skills in persona-like ways when capability language is enough
- Mixing permanent guidance with runtime-only state
- Expanding into a broad handbook instead of a focused workflow

---

## Recommended Skill Structure

Each skill is a directory containing two required files:

```
{{skill_name}}/
├── SKILL.md    — instructions loaded into context when the skill triggers
└── skill.json  — declares which tools the skill needs
```

### SKILL.md template

```markdown
---
name: {{skill_name}}
description: One sentence explaining when to load this skill and what outcome it improves
---

# {{Readable Skill Title}}

Use this skill when [clear trigger condition].

## Variables

- `{{variable}}` - what the prompt should provide

---

## Objective

- What the agent is trying to accomplish with this skill

## Steps

1. Read the current state needed for the task
2. Decide the exact path based on the prompt variables
3. Execute the work in a minimal, verifiable sequence
4. Verify the result
5. Report the outcome clearly

## Rules

- Hard constraints
- Quality bars
- Stop conditions
```

### skill.json template

```json
{
  "tools": ["tool1", "tool2"]
}
```

List only the tools the skill's steps will actually call. Keep it minimal — every extra tool adds noise. Common tools: `read`, `write`, `edit`, `glob`, `grep`, `bash`, `delegate`, `reply`, `todowrite`, `session_get`, `session_search`, `session_tree`, `agent_get`, `agent_create`, `agent_update`, `log`, `websearch`, `webfetch`, `question`, `codesearch`, `apply_patch`.

---

## Writing Guidance

### Frontmatter

- `name` should match the registry name you want agents to load
- `description` should be short, concrete, and trigger-oriented
- Prefer names that reflect the job directly, not vague improvement language

### Variables Section

- Include only variables the skill genuinely needs
- Name missing required inputs explicitly
- Let optional inputs stay optional when safe defaults exist

### Steps Section

- Organize the workflow into meaningful phases
- Use verbs like read, inspect, decide, apply, verify, report
- Focus on externally observable work, not internal chain-of-thought
- Keep steps general enough to transfer across similar tasks

### Rules Section

- State non-negotiable constraints clearly
- Add stop conditions for missing inputs or already-correct baselines
- Prevent known failure modes with concise rules

### Preservation And Validation

- Keep existing high-value rules unless they are redundant, incorrect, or explicitly replaced
- When improving a skill, mark which parts are preserved and which parts change behavior
- Favor focused additions over broad rewrites when the current skill already works
- Validate changed behavior on at least one representative task before treating the new text as final

---

## Improvement Checklist

Before saving a skill:

- [ ] The trigger for loading it is obvious from the description
- [ ] The skill solves one coherent workflow, not several unrelated ones
- [ ] Required variables are explicit
- [ ] Steps are ordered and testable
- [ ] Rules prevent likely failure patterns
- [ ] The output or final report shape is clear when structure matters
- [ ] The text is concise enough to be loaded repeatedly without waste
- [ ] `skill.json` exists and lists exactly the tools the steps will call
- [ ] Important existing behavior has been preserved or deliberately replaced with justification
- [ ] Any behavior change has a simple validation plan

---

## Retrospective And Experiment Use

When refining a skill over time:

1. Use retrospective analysis to identify waste, ambiguity, or failure patterns in sessions that loaded the skill
2. Choose one targeted change to the skill text
3. Run one improvement experiment against the affected workflow
4. Keep the change only if behavior or efficiency improves
5. Record the lesson in the skill's supporting notes or log if applicable

---

## Steps

1. Clarify whether you are creating, rewriting, or improving the skill
2. If the skill already exists, read both `SKILL.md` and `skill.json` first and list the behavior that must be preserved
3. Define the trigger, objective, variables, and expected output
4. Draft or revise `SKILL.md` with the recommended structure
5. Create or update `skill.json` — list every tool the skill's steps will call, nothing more
6. Remove noise, redundant wording, and over-prescriptive instructions
7. Verify the skill is reusable, focused, and does not accidentally remove established constraints
8. If requested, pair the change with retrospective review and an improvement experiment
