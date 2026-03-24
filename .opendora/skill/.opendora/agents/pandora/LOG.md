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
