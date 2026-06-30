---
name: chat-submit-while-agent-running-queue
title: Queue Chat Submissions While Agent Is Running
description: Preserve user-submitted chat input during active agent execution and inject it into the same session at the next safe loop boundary instead of dropping or rejecting it.
status: ready
type: feature
scope: apps/web chat submit flow plus server/session prompt_async busy-session handling
attempt: 0
max_attempts: 5
last_result: none
next_action: Trace current busy-session submit behavior from web hook through prompt_async and design a durable queued-message/injection path aligned with session/runtime boundaries.
success_criteria:
  - Submitting while the selected session is busy preserves the message instead of silently dropping it.
  - The queued message is appended/injected into the same session at the next safe agent loop boundary after the current turn finishes.
  - The user sees that their message is queued/pending and can distinguish it from a sent/accepted message.
  - Message order, model/agent attribution, attachments, and user name attribution are preserved.
  - Duplicate sends and lost queued messages are prevented across normal success, error, abort, and retry paths.
source: user
---

# Queue Chat Submissions While Agent Is Running

## Goal

Allow the user to submit chat input while the selected session's agent is actively executing (streaming, running tools, or processing), and have that input queued and injected into the same session at the next safe loop boundary — rather than being silently dropped by the web hook or rejected with a 409 by the server.

## Source Requirements

The user wants:
- If the agent is running (streaming a reply, executing tool calls, or otherwise busy) and the user types something and presses submit, the message should be **queued or injected** into the session at the next loop turn.
- The message should not be lost. The user should see that it is pending.
- Once the current agent turn finishes, the queued message becomes the next user input, and the agent responds to it.

## Problem / Motivation

Currently, submitting while the agent is running has two lossy behaviors:
1. **Web hook level:** `sendMessage` in `apps/web/hooks/use-projectflows.ts` (lines ~991-1049) returns early if `statusRef.current !== "ready"`. This means any submit while not in `"ready"` status is silently dropped — no error, no feedback, no queue.
2. **Server level:** `POST /session/:sessionID/prompt_async` in `packages/server/src/routes/session.ts` (lines ~1058-1091) returns HTTP 409 Conflict when `SessionStatus` is `busy`. This rejects the submission outright.
3. **Session level:** `SessionPrompt.loop` in `packages/session/src/prompt.ts` has a `pendingRestarts` mechanism, but `prompt_async` blocks before creating a user message while busy. There is no verified queue-and-inject behavior for a new user message arriving during an active loop iteration.

The net effect: if the user tries to send a message while the agent is responding, the message is either silently dropped (web hook) or rejected (server). The user may not realize the message was lost, leading to confusion and retry loops.

## Vision Alignment

- **Relevant product/project context:**
  - Root `VISION.md` — session owns the durable ledger and state; runtime owns execution orchestration; server is the coordination boundary.
  - `packages/session/VISION.md` — session manages entries (immutable runtime events), typed edges, session status, and the run state shape. Session is not the execution engine.
  - `packages/runtime/VISION.md` — runtime owns live execution, resume/replay, and run lifecycle. Runtime decides when a loop iteration starts, runs, and completes.
  - `apps/VISION.md` — apps use SDK as the backend gateway and must not duplicate package-owned domain behavior.
- **Product/non-goal constraints:**
  - A durable queue should be server/session-backed rather than an app-only in-memory queue, so it survives page refresh and is consistent with the session state.
  - The queue/injection mechanism must not interrupt an active tool call or corrupt the current assistant's turn.
  - The current `pendingRestarts` mechanism in `SessionPrompt.loop` is a starting point but needs verification for queued user message injection.

## Convention Constraints

- **Relevant technical/project constraints:**
  - Read `apps/web/AGENTS.md` — keep browser-facing logic inside `apps/web`; do not push UI-specific concerns into shared packages.
  - Respect SDK/server boundaries; avoid app-only queue logic that cannot survive refresh or server state.
  - If an approach depends on undocumented server behavior, mark as `needs verification`.
  - Preserve existing app structure and dependency choices.
  - `sendMessage` in `use-projectflows.ts` is the canonical submit path — do not bypass it.
- **Required stack/patterns:**
  - TypeScript, React 19, Next.js 16 (web).
  - Server routes in `packages/server/src/routes/session.ts`.
  - Session package at `packages/session/src/prompt.ts` — `SessionPrompt.loop` and `pendingRestarts`.
  - Session status/lifecycle types in `packages/session`.
  - SSE event streams for UI status updates.
  - Existing `MessageV2` create/update flow.
- **Forbidden patterns:**
  - Do not implement a purely client-side, in-memory-only queue that loses messages on page refresh without clearly documenting that limitation.
  - Do not bypass server `prompt_async` or SDK to directly inject messages into session.
  - Do not change the single-session submit model — this goal adds queueing, not multi-session or global queue.
  - Do not modify runtime's core execution loop semantics except to add a well-defined pre-loop dequeue step.
- **Verification commands:**
  - `bun run typecheck` in `apps/web` and `packages/server` and `packages/session`
  - `bun run build` in `apps/web` and `packages/server`
  - Related unit/integration tests in `packages/server` and `packages/session`
  - Manual testing in dev server

## Scope

Execution should:
1. **Trace the full submit path** — From `sendMessage` in `use-projectflows.ts` through SDK client to `prompt_async` route to `SessionPrompt.loop`. Document where and why messages are dropped/rejected.
2. **Design queue architecture** — Choose a durable queue/injection approach that fits the session/runtime ownership model. Options may include:
   - A queued-prompt concept in the session package (e.g., `pending_user_messages` field or similar).
   - Modifying `SessionPrompt.loop` to check for queued user messages at the start of each iteration, before starting a new assistant turn.
   - Adjusting `prompt_async` to accept a message even when busy but store it as a pending/queued rather than rejecting.
3. **Implement queue in session/server layer** — If the chosen approach requires session package changes (e.g., new pending-message record or field), implement there. If server route changes are needed, implement there.
4. **Update web hook** — Modify `sendMessage` or the calling code to:
   - Not return early when status is not `"ready"` (for queued submissions).
   - Send the message to the server, which now accepts it (returning a queued-accepted response instead of 409).
   - Show a queued/pending indicator in the UI so the user knows their message is accepted and waiting.
5. **Update UI status** — Ensure the user can distinguish between:
   - A sent/accepted message that is being processed.
   - A queued/pending message waiting for the current turn to finish.
   - A message that was actually rejected (error).
6. **Handle lifecycle events** — Ensure the queued message is processed after:
   - Normal completion of the current agent turn.
   - Error/abort of the current turn (message should still be processed next).
   - Retry scenarios (no duplicate queued messages).
   - Session close/cancel (queued messages are surfaced or reported as unsent).

## Out of Scope

- Multi-session global queue or cross-session message routing.
- Scheduled/delayed message sending.
- Unrelated workflow queue or job queue redesign.
- Provider retry policy changes.
- Changing the single-user, single-session conversational model — this is about queueing within one session, not broadcasting or multi-user chat.
- The separate concern of STT draft-only and recording sound (tracked in `chat-stt-draft-only-and-stop-sound`), except that both may touch `sendMessage`.

## Acceptance Criteria

1. **Submit during busy is preserved** — A user can type a message and press Enter/Send while the agent is streaming or running tools, and the message is accepted (not silently dropped, not 409 rejected).
2. **Queued state visible** — The submitted message appears in the UI with a visual indicator showing it is queued/pending, distinct from sent messages that are being responded to.
3. **Injection at next loop boundary** — After the current agent turn finishes (reply complete, error, abort, or tool-call chain ends), the queued message becomes the next user input, and the agent starts a new turn responding to it.
4. **Attachments preserved** — If the queued message includes file attachments or other payload, they are preserved and included when the queued message is injected.
5. **Attribution preserved** — Message order relative to other messages is correct. User name attribution, model/agent attribution for subsequent assistant reply, and any metadata are preserved.
6. **No duplicate sends** — Abort/retry/error paths do not produce duplicate queued messages or duplicate injection.
7. **Session lifecycle handling** — If the session is closed or reset while messages are queued, those messages are surfaced (e.g., as an unsent draft or error) rather than silently lost.
8. **Busy 409 replaced** — The `prompt_async` 409 response for busy sessions is replaced with a queued-accepted response (e.g., 202 Accepted) when a valid message is submitted during busy state.

## Judgment Rubric

**Mark done only if:**
- Submitting while busy succeeds (message is accepted, not dropped, not 409).
- The queued message is injected into the session at the next safe loop boundary (after current assistant turn completes).
- The UI shows a clear queued/pending state for the message.
- Typecheck and build pass for `apps/web`, `packages/server`, and `packages/session`.
- Manual testing confirms the flow: submit while streaming → message queued → current reply finishes → queued message appears as next user input → agent responds.

**Prefer server/session-backed queue over purely local UI queue.**
A client-side-only queue (in-memory, lost on refresh) is acceptable only as a first iteration if the durable path requires schema/storage changes that exceed scope — but it must be explicitly documented as interim with the risks stated.

**Continue if:**
- Queue stores messages but injection-at-next-boundary is not yet wired to the runtime loop.
- Queue and injection work but UI queued-state indicator is not yet built.
- Queue works for text but attachments are not yet handled.
- Queue works for normal flow but error/abort/retry paths are not yet tested.

**Block and ask if:**
- The `pendingRestarts` mechanism in `SessionPrompt.loop` cannot safely distinguish a "new user message queued during busy" from a "restart the current loop" signal.
- Creating a user message in session while the current loop is running causes the loop to consume it prematurely (i.e., mid-turn injection instead of next-boundary).
- A durable queue requires schema/storage changes that introduce migration or backward-compatibility concerns beyond scope.
- The server route cannot distinguish between a queued submit (accept even if busy) and a normal submit (only when ready) without ambiguous semantics.

## Implementation Guidance

- **Start by tracing:** `use-projectflows.ts` `sendMessage` → SDK `sendMessage`/`promptAsync` → server `routes/session.ts` `prompt_async` → `session.prompt()` → `SessionPrompt.loop`. Identify every point where a busy status causes early return or rejection.
- **`pendingRestarts` investigation:** `SessionPrompt.loop` already has a `pendingRestarts` mechanism. Determine whether this can be adapted to carry a queued user message payload (not just a restart signal) or whether a new queued-message field is needed on the session record.
- **Server route change:** `prompt_async` currently returns `res.status(409).json({ error: 'Session is busy' })` when `session.status === SessionStatus.BUSY`. Consider changing this to accept the message, store it as a pending/queued entry, and return 202 Accepted with a `{ status: 'queued', queuePosition: ... }` response.
- **Session/schema change:** If session needs to store queued messages, options include:
  - A `pending_user_messages` array/field on the session record (lightweight, no new table).
  - A new message status like `queued` that the runtime loop picks up at its next safe point.
  - Using the entry/edge model with a special "pending" entry status that the loop processes.
  - The `pendingRestarts` pattern extended with a message payload.
- **UI feedback:** The web hook should return a queued-accepted acknowledgment to the component, which then updates the message list to show the queued state. Use an existing SSE event or add a new event type for queue-status updates.
- **Safe boundary definition:** "Next safe loop boundary" means after the current assistant turn finishes — i.e., the assistant reply is complete, all tool calls in that turn have resolved, and the loop is about to check for the next user input. The queued message must NOT be injected mid-turn (which could corrupt tool call ordering or partial assistant output).
- **Abort/error handling:** If the current turn errors out or is aborted, the queued message should still be processed next — unless the error is fatal to the session. Ensure the queue drains on session close/reset with appropriate user-visible feedback.
- **Duplicate prevention:** Use a client-generated message ID or idempotency key so that retry does not produce duplicate queued messages.

## Risks / Unknowns

- **`pendingRestarts` may not carry message payload:** The current `pendingRestarts` appears to signal a loop restart, not carry a new user message. It may need extension or replacement. Execution must verify this by reading `SessionPrompt.loop` in detail.
- **Creating user message while busy may corrupt loop history:** If `session.addMessage()` or equivalent is called during an active loop, the loop may read the new message as part of the current turn's history (depending on when the LLM context is assembled). The queue must ensure the message is visible to the runtime only at the next loop boundary, not during the current turn.
- **Durable queue may require schema/storage changes:** If the session schema does not currently support pending/queued messages, adding that field may require migration, which could expand scope. Evaluate light-weight approaches first (in-memory with documented limitations) if schema changes are too invasive.
- **App-only queue loses messages on refresh:** A purely client-side queue in React state or local storage will not survive a page refresh or tab close. If the user refreshes while a message is queued, it will be lost. This may be acceptable as a first iteration but must be documented.
- **SSE event for queue status may not exist yet:** The current event stream may not have a queue-status event type. Adding one is small scope but needs verification.
- **Race condition: submit arrives just as status transitions:** If the user submits at the exact moment the status changes from busy to ready, the server may see ready and process normally, or see busy and queue. Both outcomes are acceptable as long as the message is not lost. Use idempotency keys to prevent duplicates across this boundary.

## Verification Expectations

Minimum expected verification:
- `bun run typecheck` in `apps/web`, `packages/server`, `packages/session` passes.
- `bun run build` in `apps/web` and `packages/server` succeeds.
- Unit/integration tests for `prompt_async` busy behavior:
  - Submit while busy returns 202 (or appropriate queued-accepted response), not 409.
  - Submit while ready processes normally.
  - Queued message is processed after current turn completes.
- Manual testing in dev server:
  1. **Submit while streaming:** Start a request to the agent, while it is streaming/responding, type another message and press Enter. Verify the message is accepted (shown as queued/pending), and after the current reply finishes, the queued message appears as the next user input and gets a response.
  2. **Submit while tool running:** Start an agent request that triggers tool calls. While tools are running, submit a new message. Verify it queues and processes after tool results and reply complete.
  3. **Multiple queue:** Submit multiple messages while agent is running. Verify they queue in order and process sequentially after the current turn.
  4. **Attachments:** Submit with a file attachment while busy. Verify attachment is preserved when injected.
  5. **Error/abort:** Abort the current agent turn while a message is queued. Verify the queued message is still processed after abort.
  6. **Refresh behavior (for durable implementation):** Queue a message, refresh the page. Verify the queued message is still present (for server-backed queue) or document the limitation (for app-only queue).
  7. **Normal submit still works:** Verify that submitting when status is ready works as before — no regression.
- Run existing test suites in `packages/server` and `packages/session` where available.

## Attempts

No attempts yet.

## Do Not Repeat

None yet.

## Verification Log

No verification yet.

## Final Outcome

Pending.

## Ready For Execution

- Status: yes
- Reason: Product intent is clear and the scope is well-bounded. The risk areas (pendingRestarts adequacy, message injection timing, durable queue design) are explicitly documented. Execution can begin by tracing the submit path and designing the queue mechanism, then implementing incrementally. The `max_attempts: 5` reflects the broader scope across web hook, server route, and session package with multiple design decisions.
