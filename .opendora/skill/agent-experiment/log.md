# Experiment Log

---

### exp-project-owner-20260320-1 — 2026-03-20

- **Target**: project-owner
- **Goal**: delegate by intent rather than by agent name
- **Scope**: persona
- **Change**: Replaced name-based delegation hints with capability descriptors; added explicit rule that technical questions must not be routed to requirements or planning specialists
- **Baseline**: 4/5 correct | tokens not recorded | steps not recorded
- **Post**: 4/5 correct | tokens not recorded | steps not recorded
- **Decision**: KEEP
- **Lesson**: Capability-descriptor rules improve reasoning quality even when score stays flat — the agent now correctly categorises architecture questions as technical work; the original persona had no delegation framework at all

---

### exp-project-owner-20260320-2 — 2026-03-20

- **Target**: project-owner
- **Goal**: verify delegation framework holds after prior change
- **Scope**: persona
- **Change**: None — re-run to confirm no regression
- **Baseline**: 5/5 correct | tokens not recorded | steps not recorded
- **Post**: n/a
- **Decision**: KEEP (no change made)
- **Lesson**: Re-checking after a KEEP is valid; if baseline is already 100% report and stop — do not make changes for the sake of it

---

### exp-pandora-20260321-1 — 2026-03-21

- **Target**: pandora
- **Goal**: verify pandora responds directly to simple greetings and factual questions without delegating them unnecessarily
- **Scope**: persona (runtime-only agent; no file-based persona)
- **Change**: None — baseline was already 100% correct
- **Baseline**: 5/5 correct | greeting, name, thanks, capability, casual | 0 delegations
- **Post**: n/a
- **Decision**: KEEP (no change made)
- **Lesson**: Pandora's runtime persona already handles greetings, acknowledgments, and factual questions directly; no changes needed

---

### exp-pandora-20260321-2 — 2026-03-21

- **Target**: pandora
- **Goal**: route vague product requirements through the full product chain (project-owner → PM → BA) without handling them directly
- **Scope**: injection
- **Change**: Added injection with two rules: (1) vague product requirements must be delegated to project-owner and NOT clarified directly; (2) do not create sessions or reply into other sessions after delegating
- **Baseline**: 0/1 correct | pandora delegated to project-owner but ALSO asked clarifying questions directly — dual handling
- **Post**: 1/1 correct | pandora delegated only, chain completed to BA asking questions
- **Decision**: KEEP
- **Lesson**: Runtime-only agents need explicit injection rules to prevent dual-handling; the question tool alone was insufficient guardrail

---

### exp-pandora-20260322-1 — 2026-03-22

- **Target**: pandora
- **Goal**: delegate vague product requests through the full product chain (pandora → project-owner → BA → project-owner → PM) and receive a completed requirements summary back
- **Scope**: injection (chain tracing — no artifact change attempted)
- **Change**: None — tracing experiment only
- **Baseline**: Chain traced end-to-end with manual intervention needed at step 3 | pandora→project-owner: ✅ | project-owner→BA: ✅ | BA asks questions in isolation: ⚠️ chain stalled | BA→summary after manual answers: ✅ | project-owner→PM: ✅ | requirements reached PM: ✅
- **Post**: n/a
- **Decision**: IMPROVE (not KEEP/DISCARD — this is a tracing experiment that surfaced a workflow mismatch; next step: fix BA's injection)
- **Lesson**: BA's workflow is incompatible with being spawned as a worker sub-session — it asks questions in an isolated session with no mechanism for the user to respond, stalling the chain; fix: BA should produce a requirements summary directly from the injected prompt when spawned via delegation, without asking questions; project-owner should handle user clarification through a separate role session or skip BA entirely for simple clear requests

---

### exp-ba-20260328-1 — 2026-03-28

- **Target**: ba
- **Goal**: surface the first requirements question back into the upstream conversation when delegated in a vague product chain
- **Scope**: injection
- **Change**: Added one injection rule: when working on a delegated task with reply expected, ask the first question with `reply` instead of keeping it only in the local session
- **Baseline**: 0/1 complete chains | baseline calculator-app trace showed BA asked locally with 0 reply tool calls, so the chain stalled
- **Post**: 1/1 complete chains | clean follow-up calculator-app run showed BA used `reply` and surfaced the first question into the Pandora session
- **Decision**: KEEP
- **Lesson**: The chain starts working once BA is explicitly told how to behave when reply routing is present; the generic BA injection was too user-joins-session oriented for delegated worker use

---

### exp-pandora-20260328-2 — 2026-03-28

- **Target**: pandora
- **Goal**: always preserve a return path when delegating vague build requests so downstream questions surface back into the delegated conversation
- **Scope**: injection
- **Change**: Added, then reverted, an injection rule telling Pandora to set `reply_to` so downstream questions and results return to the current session
- **Baseline**: 0/3 consistently hub-routed chains across vague simple-app tests was not yet established; mixed behavior already existed because Pandora sometimes delegated with `reply_to` and sometimes without it
- **Post**: 1/3 clearly hub-routed chains in varied simple-app retests; Pandora still omitted `reply_to` in some delegate calls, so the behavior remained inconsistent
- **Decision**: DISCARD
- **Lesson**: A light injection reminder is not strong enough to make Pandora reliably preserve return paths; this likely needs stronger prompt wording or tool-level guidance
