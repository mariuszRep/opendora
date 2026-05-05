---
name: scheduling
description: Load when a user or agent asks to create, list, inspect, update, pause/delete, or immediately run recurring OpenDora schedules, cron jobs, reminders, digests, audits, follow-ups, reports, or scheduled agent tasks.
origin: opendora
---

# Scheduling

Use this skill when the task is to manage recurring or on-demand OpenDora scheduled work for an agent.

## Inputs

- `target_agent` - agent name or ID that should receive the scheduled prompt
- `prompt` - task prompt the scheduled run should send to the target agent
- `cadence` - natural language cadence or cron expression
- `schedule_id` - existing schedule ID for inspect, update, delete, or run actions

## Objective

Create and manage scheduled OpenDora agent tasks safely and explicitly. The scheduling agent configures automation; the target agent performs the scheduled work.

## Workflow

1. Identify the requested operation: create, list, inspect, update, delete, or run now.
2. Resolve the target agent ID when a human-readable agent name is provided.
3. Convert natural language cadence into a standard UTC cron expression unless the user provides cron directly.
4. For create or update, confirm the scheduled prompt is specific enough for unattended execution.
5. Call the smallest schedule tool needed for the operation.
6. Report the schedule ID, target agent, cron expression, status, and next expected behavior.

## Cron Defaults

- Daily at 8am UTC: `0 8 * * *`
- Weekly Monday at 8am UTC: `0 8 * * 1`
- Monthly on day 1 at 8am UTC: `0 8 1 * *`

## Rules

- Do not execute the scheduled task content yourself; configure or manage the schedule only.
- Use UTC unless the user explicitly provides a timezone.
- Ask one clarification only when target agent, prompt, or cadence is missing and cannot be inferred.
- Prefer exact agent IDs over display names after resolution.
- Before deleting a schedule, confirm the schedule identity is unambiguous.
- For `run now`, trigger the schedule once without changing its cron unless the user asks to update it.
- If the user asks to pause but no pause operation exists, use the supported disable/delete/update behavior available in the schedule tool contract and report what changed.

## Output

Return a concise result with:

- Operation performed
- Schedule ID when available
- Target agent when relevant
- Cron or run timing when relevant
- Status or blocker