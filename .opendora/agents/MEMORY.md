---
name: user_name_mariusz
description: User identifies as Mariusz
type: user
---
User name is Mariusz.

---
name: execution_discipline_delegate_conservatively
description: Execution discipline preference for local-first ecosystem work and explicit blocker reporting
type: feedback
---
Use local-first execution for ecosystem-owned artifacts and avoid habitual delegation.
**Why:** User explicitly prioritizes ownership verification, broad skill scan per turn, minimal delegation, and explicit blocker transparency.
**How to apply:** Re-verify ownership/skills/tool path before major decisions; load relevant skills when they can improve outcome; keep work local unless out-of-scope, tools/authority unavailable, or a proven local blocker exists; when blocked, state exact blocker and why local resolution is impossible. Delegate PyAutoGUI tasks only when desktop GUI automation is required and target is available.

---
name: avoid_hardcoding_skill_names_in_agent_guidance
description: Prefer capability-based agent guidance over explicit skill/tool names to keep behavior portable across agents.
type: feedback
---
Rule: In agent-level governance/injection, avoid hardcoding specific skill/tool names unless strictly required by platform mechanics.

**Why:** Skills can move across agents; name-coupled instructions create brittle routing, confusion, and maintenance overhead.

**How to apply:** Write behavior as capability intents (e.g., "run requirements discovery when request is unclear"), keep concrete skill naming in skill metadata/routing config where needed, and use minimal references only when required for deterministic execution.