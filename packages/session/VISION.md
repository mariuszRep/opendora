# VISION.md — packages/session

> Owner: human. Approved intent only.

## Intent

Session owns the universal execution ledger and session state for conversations, threads, messages, attached context, and executable run history. Session is not the execution engine.

## Owns

- Session records and metadata.
- Messages and event history.
- Current attached context: active agent, loaded skills, available tools, workflow context, schedule context, and provider/model metadata.
- Canonical capture for normal agent conversations, workflow runs, schedule-triggered workflow runs, skill loading, tool availability, tool-call traces, and other executable work.
- Mixed ledgers where normal agent conversation and nested workflow execution coexist in one session history.
- Parent-session relationships for nested workflow runs.
- Session lifecycle and status.
- Run linkage, run metadata, summaries, compaction, and token usage where session-scoped.

## Does Not Own

- Public API boundary.
- Agent/tool/workflow/schedule/provider definitions.
- Identity or authorization policy.
- Physical persistence backend choice.
- Execution orchestration, provider/tool invocation, scheduling decisions, workflow advancement, or agent run control.

## Depends On

- storage for persisted session state.
- permission when session access checks are needed.

## Used By

- runtime
- server
- workflow
- schedule
- agent
- tools that inspect or manage sessions

## Boundary Rules

- Session owns the state shape, ledger shape, and lifecycle for a run.
- Agent conversations, workflow runs, and schedule-triggered workflow runs are represented as sessions or session-linked run records in one consistent format.
- A schedule run creates or resumes a parent session; the triggered workflow run is nested within that parent session.
- Workflow execution and normal agent conversation may be mixed in the same session ledger when the product flow requires it.
- Runtime causes context changes; session records those changes as current state and event history.
- Runtime may load agents, skills, tools, workflows, schedules, and providers; session records what was attached, made available, invoked, and produced.
- Session does not decide how work executes.
- Storage decides where and how that state is persisted.

## Canonical Operations

Session management tools, SDK routes, runtime flows, workflow runs, schedule-triggered runs, and package integrations must use the package-owned session operations for create, read, update, append, search, state tracking, run linkage, nesting, and lifecycle behavior.
