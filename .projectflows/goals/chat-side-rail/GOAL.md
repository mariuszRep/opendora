---
name: chat-side-rail
title: Add compact git-style side rail to chat display (superseded)
description: Superseded by session-graph-ledger-and-chat-rail. This goal was scoped UI-only but the rail requires the graph-backed ledger migration first. Retained for UI-phase implementation guidance.
status: superseded
type: feature
scope: apps/web
superseded_by: session-graph-ledger-and-chat-rail
attempt: 0
max_attempts: 3
last_result: none
next_action: null
success_criteria:
  - @gitgraph/react renders a compact git-style side rail on each visible chat/session entry, projecting session lineage from session graph data (typed edges, entry actors, display order).
  - Normal single-path chat renders as one continuous chronological rail (no branching).
  - Branch visualization appears when session graph edges show multiple outgoing edges from one entry.
  - Fan-in/merge visually rejoins paths where graph edges indicate convergence.
  - Visual markers match the VISION spec: assistant/agent = dot, user = dot+circle, workflow = circle, system = subdued/hidden.
  - Different assistant/agent identities display different colors while preserving the `assistant` actor model.
  - Existing spinner/loading treatment during agent/workflow thinking/running is preserved.
  - Existing chat rendering is extended, not replaced — the rail coexists with current message layout.
  - Source of truth remains session entries/messages, typed edges, and display order; no backend or session package changes.
  - @gitgraph/react dependency is added only to apps/web; no session or storage package imports gitgraph.
source: vision
---

# Add compact git-style side rail to chat display (superseded)

> **⚠️ SUPERSEDED**: This goal is superseded by [`session-graph-ledger-and-chat-rail`](../session-graph-ledger-and-chat-rail/GOAL.md).
> The graph-backed session ledger and its UI projection are one delivery — the rail cannot be implemented before the typed-edge ledger model exists.
> This file is retained for its detailed UI implementation guidance (component design, grid layout, @gitgraph/react approach, visual marker spec), which should be reused in the UI phase of the comprehensive goal.
> Do NOT execute this goal independently.

## Goal

Implement a compact git-style side rail on each visible chat/session entry in the web chat view, projecting session lineage from the graph-backed ledger. The rail uses `@gitgraph/react` for the compact presentation layer, coexists with the existing chat rendering, and follows the actor-based visual markers and branching/fan-in/fan-out semantics documented in the apps VISION.

## Source Requirements

The intent is captured in these VISION.md updates:

- `apps/VISION.md` — `### Chat side rail projection`, `### Rendering approaches`, `### Visual markers`
- `VISION.md` (root) — paragraph on graph-backed ledger and UI projection as one delivery
- `packages/session/VISION.md` — line on session exposing typed edges, entry actors, and display order

Key points:
- Each visible entry gets a compact git-style side rail showing session lineage.
- Normal chat = one continuous chronological rail.
- Branching only when multiple outgoing edges from one entry.
- Fan-in/merge visually rejoins paths.
- `@gitgraph/react` for the compact rail; React Flow remains for expanded workflow/canvas views.
- Visual markers: assistant=dot, user=dot+circle, workflow=circle, system=subdued.
- Different agent identities may use different colors (presentation metadata).
- Existing chat rendering is reused and extended, not replaced.
- Spinner/loading treatment preserved.
- Source of truth is session data, not component state.
- No backend or session package changes.
- No React dependencies leak into session or storage packages.

## Problem / Motivation

The session graph migration introduces a graph-backed message ledger with typed edges. The current chat UI shows a simple chronological timeline with a narrow dot rail that only connects steps within a single assistant message. It does not visualise cross-message lineage, branching, fan-out, or fan-in. As workflow execution, delegation, and parallel agent activity produce richer session topologies, users need a compact visual projection of the session graph in the normal chat view — without switching to a full canvas or workflow view. The git-style rail fills this gap as a lightweight, familiar idiom.

## Vision Alignment

Relevant product context:
- Root `VISION.md` — connected-node/line visual language; graph-backed ledger and UI projection are one delivery.
- `apps/VISION.md` — `### Chat side rail projection`, `### Rendering approaches`, `### Visual markers` subsections define the rail semantics, library roles, and marker spec.
- `packages/session/VISION.md` — session exposes typed edges, entry actors, and display order; rendering library choice is an app-layer concern.
- Existing connected-node/line visual language in root and apps VISION — the rail is a concrete application of this principle.

Product/non-goal constraints:
- The rail is a presentation projection of session graph data, not a new data model.
- `@gitgraph/react` is a presentation-layer dependency only. It must not affect session or storage packages.
- The default chat view remains a normal chat/timeline, not a replacement canvas.
- Full expanded graph views remain React Flow territory.

## Convention Constraints

Relevant technical/project constraints:
- Read root `AGENTS.md`.
- Read `apps/web/AGENTS.md` if present.
- Preserve existing chat rendering behavior. The rail supplements, not replaces.
- The existing chat uses `grid grid-cols-[20px_minmax(0,1fr)] gap-x-3` layout in `message-row.tsx` — the side rail occupies the 20px column. Work within this grid rather than restructuring the layout.
- Assistant messages already render a dot-per-step timeline within each message (via `getTimelineSteps`). The new rail is across messages, not within them. Both can coexist.

Required stack/patterns:
- TypeScript, React 19, Next.js 16.
- `@gitgraph/react` — install as a dependency in `apps/web/package.json`.
- `@xyflow/react` (12.x) already present for workflow canvas — do not replace or duplicate for the side rail.
- Session data arrives as a flat `messages` array with `info` (role, id, actor) and `parts`. Typed edges and display-order data may need to be queried or derived from the session object or a new session-graph query endpoint.
- Existing agent color utilities (`lib/agent-colors.ts`, `getAgentColor`).
- Existing `userDotColor` / `agentDotColor` / per-contribution color logic.

Forbidden patterns:
- Do not add `@gitgraph/react` to any package other than `apps/web`.
- Do not change session data model, storage contracts, or backend APIs to accommodate `@gitgraph/react`.
- Do not replace the existing message rendering or the assistant within-message timeline.
- Do not make the rail depend on React Flow packages or vice versa.
- Do not introduce new actor types or edge types to satisfy presentation needs — use existing session actor/edge types.
- Do not store gitgraph layout or component state in session data.

Verification commands:
- `bun run typecheck` in `apps/web`
- `bun run build` in `apps/web`
- Manual verification in dev server with sessions that have:
  - Simple linear message sequences
  - Delegation/agent-switch branches (multiple outgoing edges)
  - Workflow execution sessions with tool calls
  - Parallel output scenarios

## Scope

Execution should:
1. Install `@gitgraph/react` in `apps/web/package.json`.
2. Design a `ChatSideRail` component (or similar) that:
   - Accepts session graph data (typed edges, entries with actors, display order).
   - Delegates to `@gitgraph/react` to render a compact git-style rail.
   - Maps session entry actors to visual markers per the VISION spec.
   - Uses agent identity color data from existing `getAgentColor` / per-message color logic.
   - Only shows branching when session graph edges indicate fan-out.
   - Shows fan-in/merge convergence when edges indicate it.
3. Integrate the rail into the chat view:
   - Place it alongside each `MessageRow` in the existing grid layout.
   - Reuse the existing 20px rail column or adjust as needed.
   - Ensure the rail is visually aligned with the connected-node/line language.
4. Preserve:
   - The existing assistant within-message timeline (tool steps, reasoning, reply).
   - The user dot+circle rendering.
   - The Thinking spinner animation.
   - All existing message actions (copy, speak, source link, etc.).
5. Keep the rail as a pure projection of session data — no side effects on session state.

## Out of Scope

- Changing the session data model, storage, or backend APIs.
- Replacing the existing chat rendering or message-row layout.
- Implementing expanded/full graph views — React Flow already handles those.
- Changing React Flow usage or workflow editor rendering.
- Adding new actor or edge types.
- Supporting drag, zoom, pan, or interactive graph manipulation in the rail.
- Migrating the whole chat to a canvas-based view.
- Any changes to `packages/session`, `packages/storage`, or `packages/workflow`.

## Acceptance Criteria

1. **Rail rendering**:
   - `@gitgraph/react` renders a compact git-style rail for the session's visible entries.
   - Linear session history shows as a single continuous rail with dots connected by lines.

2. **Branching**:
   - When session graph edges show multiple outgoing edges from one entry, the rail branches (forks) at that point.
   - Branch lines are visually distinct from the main line.

3. **Fan-in/merge**:
   - When multiple edges converge on one entry, the rail shows a merge/fan-in joining those paths.

4. **Visual markers**:
   - Assistant/agent entries show as a dot.
   - User entries show as a dot with a surrounding circle.
   - Workflow entries show as a circle.
   - System entries use a subdued/internal marker or are hidden/collapsed unless relevant.

5. **Color differentiation**:
   - Different agent identities within the same session use different dot/branch colors.
   - Colors are derived from existing `getAgentColor`/per-message color logic, not a new color system.

6. **Coexistence**:
   - Existing assistant within-message timeline still renders correctly.
   - User message dot+circle still renders correctly.
   - Thinking spinner is preserved.
   - All message actions (copy, speak, source, etc.) remain functional.

7. **Data integrity**:
   - The rail is a read-only projection of session graph data.
   - No session state is modified by rail rendering.
   - No new data fetching beyond what the session already provides.

8. **Package boundary**:
   - `@gitgraph/react` appears only in `apps/web/package.json`.
   - No imports of `@gitgraph/react` exist outside `apps/web/`.

## Judgment Rubric

Mark done only if:
- `@gitgraph/react` renders a real git-style rail (not just a placeholder or existing dot column) with branching/merge visible in appropriate sessions.
- Normal linear chat sessions show a clean continuous rail without phantom branches.
- Visual markers match the VISION spec table.
- Different agent colors are visibly different on the rail.
- Typecheck and build pass for `apps/web`.
- Existing message rendering and interactions are unchanged in non-rail areas.

Continue if:
- Rail renders but branching logic is incomplete (e.g., always linear, never branches).
- Rail renders but visual markers are not distinct enough (e.g., all dots look the same).
- Rail renders but color differentiation is not yet connected to agent identity data.
- Rail renders but fan-in/merge is not yet implemented.
- Rail renders but causes minor layout shift in the chat grid.

Block and ask if:
- `@gitgraph/react` introduces a breaking change to the build pipeline or React version compatibility.
- The session graph data needed for the rail (typed edges, display order) is not yet available through the existing session query path.
- There are unresolved conflicts between `@gitgraph/react` rendering and the existing sticky-bottom / scroll behavior.

## Implementation Guidance

- Start by examining `apps/web/app/dashboard/message-row.tsx` — it renders each message in a `grid grid-cols-[20px_minmax(0,1fr)] gap-x-3` layout. The 20px column currently holds the dot/connecting-line visual for the within-message timeline. The new rail could sit in this same column, or the layout could expand to accommodate a wider rail (e.g., `grid-cols-[40px_minmax(0,1fr)]` or similar).

- The existing rail column renders:
  - **User messages**: a dot with a surrounding circle outline (`border-2` ring), colored by `userRingColor`.
  - **Assistant messages**: a per-step timeline within the message, where each tool/reasoning/reply step gets a dot with a connecting line below it. The last step has no connecting line.

- The new across-message rail needs access to **session graph edge data**. Currently `chatbot.tsx` receives a flat `messages` array. Determine how typed edges and display-order data are queried — they may come through `useOpendoraContext()` or the session object. If the graph topology is not yet exposed, that may need a small additive API surface (but no backend changes — see out of scope).

- `@gitgraph/react` works by constructing a `gitgraph` instance and calling methods like `graph.branch("name")`, `branch.commit()`, `branch.merge()`. The rail component should translate session edge topology into these gitgraph primitives.

- The component should be purely presentational: receive session entries, typed edges, display order, and color map as props; render via `@gitgraph/react`; avoid any side effects.

- Agent identity colors are already computed in `message-row.tsx` (`assistantMessageColor`, `userRingColor`, `assistantContributionColor`). Reuse these computations or lift them so the rail component can access them.

- The `@gitgraph/react` canvas uses an SVG-based renderer. It may need explicit width/height or container sizing to fit in the narrow rail column. Test with the actual chat layout.

- `@gitgraph/react` version: use the latest stable version compatible with React 19. Check compatibility before installing.

- Existing `apps/web/components/ai-elements/conversation.tsx` wraps the message list with `Conversation` / `ConversationContent` — the rail integration point is the message iteration inside `ConversationContent`.

## Risks / Unknowns

- `@gitgraph/react` compatibility with React 19 and Next.js 16 client components is unverified. Verify before committing to the approach.
- The session graph edge data (typed edges across messages, not just within-message) may not yet be exposed through the current session query path. Execution may need to derive edges from `parentSessionID`/`parentMessageID` fields, or a new lightweight query may be needed. If edge data is unavailable, the rail falls back to linear-only rendering.
- `@gitgraph/react` is primarily designed for git branch visualisation; adapting it to session lineage topology with non-git semantics (fan-in from multiple sources, display order vs. causal order) may require workarounds or a bespoke lightweight renderer instead.
- The narrow rail column (20px) may be too tight for gitgraph's default node/circle sizes. Consider widening the column or configuring gitgraph's rendering options for compact output.
- The existing chat uses `use-stick-to-bottom` for scroll behavior. A growing SVG rail inside each message row could interact with scroll anchoring. Test this explicitly.
- If `@gitgraph/react` proves unsuitable (React 19 incompatibility, layout issues, licensing), the fallback is a hand-rolled SVG/Canvas rail following the same visual spec without the library dependency.

## Verification Expectations

Minimum expected verification:
- `bun run typecheck` in `apps/web` passes with `@gitgraph/react` installed.
- `bun run build` in `apps/web` succeeds.
- Manual testing with these scenarios in the dev server:
  1. **Linear session**: Open a normal chat session with 5+ user/assistant exchanges. Verify the rail shows a continuous single-line sequence with correct markers (dot for assistant, dot+circle for user).
  2. **Branching/delegation**: If a session has delegation (multiple agents contributing), verify the rail shows a branch at the delegation point.
  3. **Workflow session**: Open a session with workflow execution steps. Verify workflow entries show the circle marker and any fan-out/fan-in is visible.
  4. **Color differentiation**: If the session uses multiple agents with different colors, verify the rail shows distinct colors.
  5. **Existing behavior preserved**: Verify the within-message timeline still shows correctly, the thinking spinner still animates, and all message actions work.
- Visual inspection that the rail does not cause layout shift, overflow, or scroll issues.
- Confirm no imports of `@gitgraph/react` exist outside `apps/web`.

## Attempts

No attempts yet.

## Do Not Repeat

None yet.

## Verification Log

No verification yet.

## Final Outcome

Pending.

## Ready For Execution

- Status: no — superseded
- Reason: The graph-backed session ledger must be implemented FIRST (see session-graph-ledger-and-chat-rail). This goal's UI approach remains valid and should be reused as the UI phase of the comprehensive migration goal. The original rationale (product intent confirmed in VISION.md files, bounded scope, clear criteria) still applies to the UI portion of the comprehensive delivery.
