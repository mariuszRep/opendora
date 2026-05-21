---
name: evaluate-skill
description: Evaluate skill effectiveness and trigger quality using controlled prompts and scored assertions. Use for skill evals and skill benchmarks.
origin: opendora
---

# Skill Evaluation Skill

Use this skill to evaluate whether a skill improves outcomes and triggers correctly.

## Alias Triggers

- "skill eval"
- "evaluate skill"
- "skill benchmark"
- "skill trigger test"

## Objective

- Verify a skill helps task quality versus baseline.
- Measure trigger precision on should-trigger and should-not-trigger prompts.
- Recommend keep, revise, or retire.

## Variables

- `{{skill_name}}` - skill to evaluate.
- `{{task_set}}` - prompts to test with expected outcomes.
- `{{trigger_set}}` - prompt set for trigger/no-trigger checks.

## Steps

1. Define evaluation prompts and assertions.
2. Run with-skill and baseline executions.
3. Score output quality and assertion pass rate.
4. Run trigger precision check.
5. Report metrics and required changes.

## Rules

- Use identical prompts between baseline and with-skill runs.
- Keep scoring criteria explicit and binary when possible.
- Include at least one failure example in the report.