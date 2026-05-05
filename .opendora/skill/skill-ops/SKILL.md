---
name: skill-ops
description: Required lane for all skill work: create/update SKILL.md and skill.json, improve trigger descriptions, and run skill eval/benchmarks. Do not use for agent persona/config or tool metadata updates.
origin: opendora
---

# Skill Operations Skill

Use this skill for creating new skills, improving existing skills, running evaluations and benchmarks, and managing all skill lifecycle tasks.

## Alias Triggers

- "skill operations"
- "skill management"
- "create a new skill"
- "improve a skill"
- "run skill evals"
- "benchmark skill"

---

## Part 1: Skill Authoring

Use this when creating a new skill, rewriting an existing skill, or tightening a skill that is too vague, too procedural, or too brittle.

### No-Regression Rule

- Preserve important existing workflow and constraints unless the prompt explicitly calls for changing them
- Prefer additive guidance over deleting established instructions
- If a current behavior must change, identify the old behavior, the new behavior, and the validation needed before keeping the change
- Treat the existing skill text as a baseline to compare against, not just a draft to overwrite

### Variables

- `{{skill_name}}` - filesystem and registry name for the skill
- `{{goal}}` - what the skill should help an agent accomplish
- `{{scope}}` - `new`, `rewrite`, or `improve`
- `{{target_users}}` - which kinds of agents should load it

---

### What A Good Skill Does

- Gives an agent a repeatable workflow for a narrow class of work
- Defines what inputs the session prompt should provide
- Tells the agent what to produce, not every tiny thought to think
- Uses rules and decision points to reduce ambiguity
- Stays reusable across many sessions instead of encoding one-off context

### What A Skill Must Avoid

- Hardcoding one specific session's data as if it were permanent
- Over-specifying trivial actions that the base model already handles well
- Naming specific agents, tools, or skills in persona-like ways when capability language is enough
- Mixing permanent guidance with runtime-only state
- Expanding into a broad handbook instead of a focused workflow

---

### Recommended Skill Structure

Each skill is a directory containing two required files:

```
{{skill_name}}/
├── SKILL.md    — instructions loaded into context when the skill triggers
└── skill.json  — declares which tools the skill needs
```

---

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

---

### skill.json template

```json
{
  "tools": ["tool1", "tool2"]
}
```

List only the tools the skill's steps will actually call.

---

## Part 2: Skill Creation Workflow

Use this for hands-on skill creation with test cases, evaluation, and iteration.

### The Skill Creation Process

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run the skill on them
- Evaluate the results qualitatively and quantitatively
- Rewrite the skill based on feedback
- Repeat until satisfied
- Expand the test set and try again at larger scale

---

### Creating A Skill

#### Capture Intent

Start by understanding the user's intent:
1. What should this skill enable the agent to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify the skill works?

#### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies.

#### Write the SKILL.md and skill.json

- **name**: Skill identifier
- **description**: When to trigger, what it does. Include both what the skill does AND specific contexts for when to use it. Make descriptions "pushy" to combat under-triggering.

---

### Anatomy of A Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description — only these two fields)
│   └── Markdown instructions
├── skill.json (required)
│   └── { "tools": ["tool1", "tool2"] }  — tools the skill's steps will call
└── Bundled Resources (optional)
    ├── scripts/    - Executable code
    ├── references/ - Docs loaded as needed
    └── assets/     - Files used in output
```

**`skill.json` rules:**
- Always create it alongside SKILL.md
- List only tools the skill's steps actually call
- Never declare tools in SKILL.md frontmatter — `skill.json` is the single source of truth

---

### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) - Always in context
2. **SKILL.md body** - In context whenever skill triggers
3. **Bundled resources** - As needed

---

### Writing Style

- Prefer using the imperative form in instructions
- Try to explain WHY things are important
- Use theory of mind and make skills general, not super-narrow
- Start by writing a draft and then look at it with fresh eyes

---

## Part 3: Skill Evaluation & Benchmarking

### Test Cases

After writing the skill draft, come up with 2-3 realistic test prompts. Save to `evals/evals.json`:

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
```

---

### Running Evaluations

1. **Spawn all runs** (with-skill AND baseline) in parallel:
   - With-skill: includes the skill
   - Baseline: without skill (creating new) or old version (improving existing)

2. **Draft assertions** — quantitatively verifiable checks

3. **Grade each run** — evaluate assertions against outputs

4. **Aggregate into benchmark** — produce pass_rate, time, tokens

5. **Launch the viewer** — show results to human for review

6. **Read feedback** — focus improvements on negative cases

---

## Part 4: Description Optimization

The description field in SKILL.md frontmatter is the primary mechanism for skill triggering.

### Optimization Steps

1. **Generate trigger eval queries** — 20 realistic queries (should-trigger and should-not-trigger)

2. **Review with user** — validate eval set

3. **Run optimization loop** — iterate up to 5 times, select by test score

4. **Apply the result** — update skill description

---

## Quality Checklist

Before saving any skill:

- [ ] The trigger for loading it is obvious from the description
- [ ] The skill solves one coherent workflow, not several unrelated ones
- [ ] Required variables are explicit
- [ ] Steps are ordered and testable
- [ ] Rules prevent likely failure patterns
- [ ] The output or final report shape is clear
- [ ] `skill.json` exists and lists exactly the tools
- [ ] Important existing behavior has been preserved or deliberately replaced

