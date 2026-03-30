# LOG — Agent: agent-owner

---

### 2026-03-30 09:54:10 UTC [ADVISORY]

Delegation experiment showed reply-induced ping-pong. Pandora delegated to Project Owner without reply_to, so the child ran synchronously and its spawn_result surfaced back into Pandora. Project Owner correctly delegated to BA with reply_to=Pandora session, but BA then emitted multiple reply messages without waiting for new user input, and Pandora later replied upstream and spawned a second Project Owner session. This wastes steps/credits and suggests delegated agents need a hard stop after reply when gathering requirements asynchronously.

_Context: ses_2c1dc1464ffe7ktWOjQo2UhGVu_

---
### 2026-03-30 10:18:40 UTC [BUG]

Skill registry appears stale. After creating `/home/ubuntu/projects/opendora/.opendora/skill/feature-workflow/SKILL.md` and `/home/ubuntu/projects/opendora/.opendora/skill/project-initiation/SKILL.md`, `skill_discover` still reports only `pm-feature-workflow`, `skill_load("feature-workflow")` fails as not found, and `agent_get` reports PM skills as none even though `.opendora/agents/pm/agent.json` contains `feature-workflow` and `project-initiation` in `skills`.

_Context: ses_2c1cb6727ffeUlbU89d1LbZmrM_

---
