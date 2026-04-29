# LOG — Agent: pandora

---

### 2026-03-23 14:27:31 UTC [BUG]

Phantom delegation: Pandora announced "passed to team" but didn't call delegate tool. User had to ask "who did you pass it to?" causing a wasted round-trip. Fix: Add rule that claiming delegation requires the delegate tool to actually be called.

_Context: ses_2e4fc422affe2hg6n91iMcIRkl_

---
### 2026-03-23 14:37:19 UTC [BUG]

Phantom delegation: Pandora claimed she "passed to the right team" but hadn't actually called the delegate tool. User had to ask "who did you pass it to?" to trigger the real delegation. Fix: Pandora's rule - "If you say you delegated, the delegate tool must already have been called."

_Context: ses_2e4fc422affe2hg6n91iMcIRkl_

---
### 2026-03-24 13:14:43 UTC [BUG]

Pandora delegated with wait: false (fire and forget) and didn't set up reply tracking. User was left without knowing who would respond. Should have either waited (if quick) or set reply_to to ensure user gets a reply.

_Context: ses_2e179f3aaffemt9fyidvyofnW0_

---
### 2026-03-26 19:09:10 UTC [ERROR]

Delegation run failed with ProviderModelNotFoundError before taking action. Updating Pandora model from invalid/unavailable fallback model to fallback/minimax-m2.5 restored execution for experiment routing.

_Context: ses_2d47bff79ffeC9G3eKUobE0uuA_

---
### 2026-03-28 09:32:17 UTC [FAILED]

Tried adding an injection rule to always set reply_to on delegation so downstream questions return to the current session. In varied vague-app tests, Pandora still omitted reply_to in some delegate calls, so the chain remained inconsistent. The behavior appears to need stronger tool-level guidance or a more direct instruction than the current injection phrasing.

_Context: exp-pandora-20260328-2_

---
### 2026-03-28 09:32:20 UTC [ADVISORY]

Pandora's persona still says to send a brief confirmation after delegating, while the delegate tool contract says the turn is complete after async delegation. This conflict correlates with duplicate or mixed user-facing updates in delegation-chain tests.

_Context: exp-pandora-20260328-2_

---
### 2026-04-29 09:31:34 UTC [BUG]

Pandora routed an ambiguous product/capability request ('add Playwright MCP to OpenDora') directly to Minds as ecosystem work without clarifying whether the user wanted product planning. User later objected that Product Owner should have owned it.

_Context: ses_2276fcb31ffe0i0MqM8neaecwT_

---
### 2026-04-29 10:00:17 UTC [BUG]

During routing experiment exp-pandora-20260429-1, a natural baseline probe caused delegated work to implement Playwright MCP config in .opendora/opendora.json despite the prompt being intended as routing/planning. This shows Pandora can route/allow execution too early for ambiguous OpenDora MCP requests.

_Context: exp-pandora-20260429-1_

---
