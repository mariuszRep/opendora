---
name: intake-triage
description: Classify an incoming product request, search for related existing work first, and decide whether to reuse a session, create a new scope, or close the request.
---

# Intake Triage

Use this skill when a new product request arrives and you need to decide what workstream it belongs to before requirements or delivery continue.

## Objective

- Turn a raw incoming request into the correct next action.
- Prevent duplicate scopes and duplicate delivery work.

## Steps

1. Classify the request: new project, new feature, bug, question, investigation, or continuation of existing work.
2. Search existing sessions before creating any new scope.
3. Inspect the most relevant existing sessions to determine whether matching work already exists and what state it is in.
4. Decide one of these outcomes:
   - continue an existing session
   - report that the work is already done
   - create a new readiness scope
   - return for clarification
   - route a non-delivery question elsewhere
5. State the chosen path clearly and move the work into the correct hub session.

## Ownership Boundaries

- Product/development work belongs to the product authority until approved for delivery.
- Early intake may clarify enough to route, but it must not make product, code, architecture, or delivery decisions.
- Ecosystem capability work belongs to the ecosystem steward.
- Approved implementation belongs to the delivery owner only after the responsible authority approves it.

## Communication Tools

- Use `question` only for direct human-user clarification needed to classify or route the request.
- Use `delegate` when another agent should act, answer, or continue the conversation.
- Use `reply` only to post classification, status, or handback to an upstream session without triggering action.
- If asking another agent a question, use `delegate`, not `reply`.
- If asking the user a question, use `question`, not `reply`.

## Rules

- Do not create a new scope before searching for related sessions.
- Do not treat the intake scratchpad as the long-lived workstream once the right scope is known.
- End the intake with a concrete disposition, not an open-ended conversation.
- If the request appears to match existing delivered work, verify that before declaring it done.

## Output

Provide:

- request classification
- related sessions checked
- chosen disposition
- the next session or workflow owner
