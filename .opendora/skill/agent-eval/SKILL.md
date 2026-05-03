---
name: agent-eval
description: Evaluate agent behavior quality with repeatable tests, scoring, and pass/fail reports. Use for agent evals, benchmarks, and regression checks.
origin: opendora
---

# Agent Evaluation Skill

Use this skill when you need to measure an agent's behavior against explicit criteria.

## Alias Triggers

- "agent eval"
- "evaluate agent"
- "agent benchmark"
- "agent regression test"

## Objective

- Build a repeatable evaluation set for one target agent.
- Run baseline and candidate behavior with the same prompts.
- Score outcomes and report pass rate, failure modes, and recommendation.

## Variables

- `{{target_agent}}` - agent ID to evaluate.
- `{{goal}}` - behavior quality being measured.
- `{{test_mode}}` - `questions` or `workflow`.
- `{{success_criteria}}` - concrete pass conditions.

## Steps

1. Confirm target and goal.
2. Define 5-10 deterministic test cases.
3. Run tests in fresh sessions using `delegate`.
4. Collect outputs with `session_get`.
5. Grade against criteria.
6. Summarize failures and recommendations.

## Rules

- Keep test prompts identical across runs.
- Do not change the target agent while evaluating.
- Report evidence by session ID for failed cases.