# RunWorkflow Input Fix Specification

**Status:** Superseded by canonical ready goal
**Date:** 2026-07-22

---

> Historical specification. The canonical implementation goal is `.projectflows/goals/ready/run-workflow-child-composition-contract/GOAL.md`. Preserve this file for discovery history; execute from the goal.

## Goal

Make RunWorkflow reliably forward parameterized child-workflow inputs in their native types and make a waited child result available as a native structured workflow value.

## User Story

As a workflow author, I can invoke a parameterized child workflow with either an explicit input object/JSON string or individual node fields, and downstream nodes receive the child result without reparsing display JSON.

## Acceptance Criteria

1. In `packages/workflow/src/runner.ts` RunWorkflow assembly, `input` is a reserved `workflow_run` control key (alongside `workflowId`, `wait`, `agentId`, `workdir`; runner-only `output`/`resultPath` are never forwarded). Resolve all configured values with `resolveDeep` before assembly, preserving nested objects/arrays and nested `$input`/`$ctx` references.

2. Explicit input accepts a non-null, non-array object or a JSON string resolving to one. A JSON string must parse successfully and its parsed value must be a non-null, non-array object. Blank strings, malformed JSON, JSON arrays, JSON primitives, null, arrays, and other resolved types fail before tool invocation with an actionable error naming the RunWorkflow node and input. No fallback to `{}`.

3. Existing individual extra fields remain supported. Create child input from explicit input plus individual extra fields. Non-overlapping keys are merged. A key supplied by both forms is a deterministic configuration error that names the key and node; do not silently overwrite. An input parameter literally named `input` remains available only inside explicit input, because top-level `input` is now reserved.

4. Force `wait=true` for native RunWorkflow nodes as today; do not forward node `output`/`resultPath` bookkeeping as child arguments.

5. Native structured result: add an additive detailed child-run result contract in `packages/workflow/src/runner.ts` while preserving the existing `runWorkflow(...): Promise<string>` public behavior for routes/schedules/callers. The detailed result has a `display` output string and a structured completion envelope `{ status, result? }`, where `result` is the Output node's type-preserving resolved object when present. The workflow service bridge and registry `workflow_run` tool use this detailed contract for `wait=true` and return that envelope as `outputObject` while keeping `output` as the compatible display string. RunWorkflow stores `outputObject` directly under its `output`/`storeAs`/`node` key; it must not `JSON.stringify` it. Thus downstream `$ctx.<run-node-key>` and `for_each` collect receive native object/array/number/boolean child output. If the child lacks an Output node, propagate the native status envelope without a `result` field.

6. Child Parameters validation failures (required missing or enum violation) and RunWorkflow input-shape/collision failures use a shared exported deterministic workflow validation-error class/type. ForEach immediately rethrows this class and does not perform its 3-attempt/backoff retry. Other operational errors retain current retry behavior.

7. Update `projectflows-website/registry/tools/workflows/src/workflow-run.ts` and tool-sdk HostServices workflow typing additively to consume the detailed result; make its JSON-string input parser strict (current catch-to-`{}` behavior is prohibited) so direct `workflow_run` calls also reject malformed/non-object JSON. Keep direct object input supported and existing asynchronous `wait=false` behavior intact.

8. Synchronize distribution artifacts: rebuild `projectflows-website/registry/tools/workflows/tools/index.js` from the workflows source using its documented `bun run tools:build workflows` (or equivalent documented group build), commit source and generated bundle together, then use the normal `bun dev:setup`/packaging path when an installed runtime update is required. Do not hand-edit bundles or `~/.projectflows/tools`.

9. Apply the immediate runtime workflow workaround (separate from source engine change) in `/home/mariusz/.projectflows/workflows/ai-news-rss-top-impact-publisher/workflow.json`: replace the Run Story Worker node's explicit input JSON blob with its constituent child parameter fields at the same parameters level: `run_id`, `cluster_id`, `canonical_title`, `event_date`, `selection_rank`, `agent_reasoning`, `impact_score`, `workflow_root`, `database_path`, `website_base_url`. Retain `workflowId`, `wait`, `output`, and references/constant values exactly. This lets the current engine proceed via its legacy individual-field behavior.

10. Tests: add focused bun tests (prefer `packages/workflow/src/runner.run-workflow.test.ts` or similarly scoped runner test, with mocked executor/services at boundaries) covering direct explicit object, explicit JSON string, legacy individual fields, non-overlapping merge, nested `for_each` `$ctx.current_selection` templates, missing/blank/malformed/non-object explicit inputs, collision, required child parameter missing, native result envelope and nested output types, and direct RunWorkflow `ctx`/`storeAs` values being objects not JSON strings. Add/extend registry `workflow_run` tests for strict string parser and `outputObject` propagation. Add a `for_each` test proving a deterministic validation error invokes a child only once/no retry and an operational error still retries. Preserve existing executor `outputObject` coverage.

## Scope

In: runner, server workflow bridge, registry workflow tool/SDK typing, tests, generated workflow bundle, and the stated installed AI-news workflow workaround.

Out: UI redesign, new node types, changes to generic tool retry policy, changing non-workflow tool output behavior, modifying child parameter schema semantics beyond classifying its existing validation errors.

## Architecture Notes

- Runner assembly currently at `packages/workflow/src/runner.ts:477-503` incorrectly treats `input` as an extra field; retry loop at `:529-579`; `resultPath`/string storage `:582-598` and generic context storage `:926-933`; `for_each` unconditional retry at `:700-741`; child finalizer returns JSON/text string at `:1047-1077`.
- Node-registry default RunWorkflow input is at `packages/workflow/src/node-registry.ts:653-672`.
- Server bridge is `packages/server/src/workflow-tool-executor.ts:90-95` and executor `outputObject` flow is `:112-116`, `:193-198`.
- Registry reference parser is `projectflows-website/registry/tools/workflows/src/workflow-run.ts:14-31` and waited execution `:99-105`; its published generated bundle is `registry/tools/workflows/tools/index.js`.
- Registry host typing is `projectflows-website/tool-sdk/host.ts:82-86`.
- Conventions require source-to-bundle sync (`opendora/CONVENTIONS.md:24-37`, `115-149`).

## Risks and Open Questions

- No unresolved product choices.
- Preserve `runWorkflow` string API via additive detailed API; avoid parsing display strings as the structured result.
- Validation class must survive the direct registry tool/engine call chain so `for_each` recognizes it; avoid wrapping it.
- Registry uses Zod v3 while opendora uses Zod v4, so keep schemas idiomatic to each repo.
- Installed `~/.projectflows` workflow edit is a deliberate immediate runtime workaround; its catalog source, if any, was not identified and is out of scope unless discovered during implementation.

## Verification

- Run targeted `bun test` commands in affected opendora packages and registry test/build/validation commands; at minimum:
  - `bun test packages/workflow/src/runner*.test.ts`
  - `bun test packages/server/test/tool/workflow-tool-executor.test.ts`
  - In website: `bun test` relevant tool tests plus `bun run tools:build workflows` and `bun run registry:validate`
- Confirm generated index bundle changes only through builder.
- Manually run AI-news parent with at least one selection and verify:
  - Child gets all declared parameters once, no validation retry.
  - Collected result is a native object.
  - Malformed explicit input fails once with clear error.

## Immediate Workflow Workaround

Apply in `/home/mariusz/.projectflows/workflows/ai-news-rss-top-impact-publisher/workflow.json`: replace the Run Story Worker node's explicit input JSON blob with its constituent child parameter fields at the same parameters level: `run_id`, `cluster_id`, `canonical_title`, `event_date`, `selection_rank`, `agent_reasoning`, `impact_score`, `workflow_root`, `database_path`, `website_base_url`. Retain `workflowId`, `wait`, `output`, and references/constant values exactly. This lets the current engine proceed via its legacy individual-field behavior.
