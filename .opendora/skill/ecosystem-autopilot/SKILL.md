---
name: ecosystem-autopilot
description: Run recurring OpenDora ecosystem self-improvement audits and controlled experiments across agents, skills, tools, sessions, schedules, routing, and coordination; use for unattended scheduled improvement loops and overnight autopilot runs.
origin: opendora
---

# Ecosystem Autopilot

Use this skill when OpenDora should run an unattended or recurring self-improvement cycle across the agent, skill, tool, session, schedule, and coordination ecosystem.

## Variables

- `active_window` - allowed run window, for example `23:00-05:00 Europe/London`.
- `cycle_id` - unique run label, for example `ecosystem-autopilot-YYYYMMDD-HHMM`.
- `mode` - `audit-only`, `experiment`, or `maintenance`; default to `audit-only` for early runs.
- `risk_level` - maximum permitted change level: `read-only`, `low-risk`, `medium-risk`; default `read-only` unless explicitly approved.
- `focus` - optional target area: `agents`, `skills`, `tools`, `sessions`, `schedules`, `coordination`, or `auto`.

## Objective

Continuously improve OpenDora by rotating attention across the ecosystem, finding gaps with evidence, running controlled evaluations, and recording durable lessons so future cycles do not repeat the same work.

## Operating Loop

1. Start a cycle with `todowrite` and assign a `cycle_id`.
2. Read recent context: active schedules, recent sessions, known logs, agent inventory, skill inventory, and tool inventory.
3. Pick one focus area using this priority order:
   - critical logged failures or broken coordination
   - neglected area not inspected recently
   - repeated inefficiency across sessions
   - high-blast-radius agents, skills, or tools
   - stale schedules or unused capabilities
4. Audit only the selected focus area deeply; do not spread the cycle across everything shallowly.
5. Capture evidence before recommending any change: session IDs, tool metadata, agent config, skill trigger text, schedule IDs, or eval results.
6. Choose exactly one improvement candidate for the cycle.
7. If the candidate requires another specialist capability, delegate with a precise brief and require a result summary.
8. Validate the candidate with a before/after eval or session retrospective when possible.
9. Record the finding, action, validation, and next focus in durable logs.
10. End with a concise report: focus, evidence, decision, risk level, and next cycle recommendation.

## Focus Areas

### Agents

Inspect persona scope, tool access, skill allocation, step budget, model choice, delegation boundaries, reply behavior, and whether the agent owns the work it receives.

### Skills

Inspect trigger descriptions, workflow clarity, required variables, tool declarations, under-triggering, over-triggering, overlapping skills, and missing evals.

### Tools

Inspect selection metadata, parameter descriptions, neighboring-tool confusion, misuse evidence, and whether descriptions match actual behavior.

### Sessions

Inspect routing correctness, duplicate reads, deep delegation chains for shallow work, missing replies, idle delegations, repeated skill loads, and token/step waste.

### Schedules

Inspect cadence, ownership, duplicate schedules, stale prompts, active/inactive state, run mode, and whether scheduled output is useful.

### Coordination

Inspect how agents hand off work, whether requirements are asked by the correct owner, whether specialists are used by capability instead of name, and whether return paths are respected.

## Risk Gates

- `read-only`: allowed to inspect, evaluate, log, and recommend only.
- `low-risk`: allowed to improve descriptions, prompts, and metadata after targeted validation.
- `medium-risk`: allowed to update agent config, skill content, or schedule prompts only after baseline/post comparison.
- Always ask the user before deleting agents, removing skills, disabling schedules, changing broad routing rules, or making changes with unclear blast radius.

## Ledger Protocol

Every cycle must log at least one durable result unless no actionable signal exists.

Use this entry shape in logs or reports:

```text
Cycle: <cycle_id>
Area: agents | skills | tools | sessions | schedules | coordination
Target: <id or name>
Finding: <specific gap>
Evidence: <session id, eval id, tool id, schedule id, or config fact>
Action: changed | recommended | skipped | delegated | blocked
Validation: pass | fail | partial | not-run
Next: <specific next inspection or experiment>
Risk: read-only | low-risk | medium-risk | needs-user-approval
```

## Rotation Rules

- Do not work on the same target in two consecutive cycles unless it is blocking the whole ecosystem.
- Prefer neglected areas over repeatedly optimizing the most visible agent.
- If no strong signal exists, run a session retrospective first because sessions reveal real coordination behavior.
- Keep each cycle small enough to finish before the next scheduled run.

## Output

Return:

```text
Ecosystem Autopilot: <cycle_id>
Mode: <mode>
Focus: <area / target>
Finding: <one sentence>
Evidence: <ids or facts>
Action: <what changed or recommended>
Validation: <result>
Next: <next cycle target>
Status: done | blocked | needs-user-approval
```

## Rules

- Never claim improvement without evidence.
- Never make broad rewrites during unattended runs.
- Never delete or disable ecosystem components without explicit user approval.
- Prefer one validated improvement over many unvalidated observations.
- Treat logs as memory: read them before choosing a target and write them after each cycle.
- If blocked by missing authority or unclear risk, produce a recommendation and stop.