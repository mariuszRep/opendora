---
name: evaluate-tool
description: Evaluate tool metadata quality and selection accuracy with misuse-focused test scenarios. Use for tool evaluation, tool selection tests, and parameter-fill audits.
origin: opendora
---

# Tool Evaluation Skill

Use this skill when you need to validate that tool descriptions drive correct tool selection and parameter filling.

## Alias Triggers

- "tool eval"
- "evaluate tool metadata"
- "tool selection test"
- "tool parameter audit"

## Objective

- Detect wrong-tool picks and parameter misuse patterns.
- Measure selection accuracy before and after metadata updates.
- Produce a prioritized fix list.

## Variables

- `{{tool_name}}` - target tool to evaluate.
- `{{neighbor_tools}}` - similar tools likely to be confused.
- `{{scenario_set}}` - realistic usage prompts.

## Steps

1. Build confusion scenarios against neighboring tools.
2. Run scenarios and capture chosen tool and parameters.
3. Score selection correctness and parameter correctness.
4. Identify recurring confusion patterns.
5. Report recommended metadata edits.

## Rules

- Keep evaluation centered on metadata behavior, not runtime implementation.
- Separate selection errors from parameter-fill errors.
- Provide at least three scenarios for each confusion pair.