# LOG — Agent: agent-owner

---

### 2026-03-30 09:54:10 UTC [ADVISORY]

Delegation experiment showed reply-induced ping-pong. Pandora delegated to Project Owner without reply_to, so the child ran synchronously and its spawn_result surfaced back into Pandora. Project Owner correctly delegated to BA with reply_to=Pandora session, but BA then emitted multiple reply messages without waiting for new user input, and Pandora later replied upstream and spawned a second Project Owner session. This wastes steps/credits and suggests delegated agents need a hard stop after reply when gathering requirements asynchronously.

_Context: ses_2c1dc1464ffe7ktWOjQo2UhGVu_

---
### 2026-03-30 10:18:40 UTC [BUG]

Skill registry appears stale. After creating `/home/mariu/projects/opendora/.opendora/skill/feature-workflow/SKILL.md` and `/home/mariu/projects/opendora/.opendora/skill/project-initiation/SKILL.md`, `skill_discover` still reports only `pm-feature-workflow`, `skill_load("feature-workflow")` fails as not found, and `agent_get` reports PM skills as none even though `.opendora/agents/pm/agent.json` contains `feature-workflow` and `project-initiation` in `skills`.

_Context: ses_2c1cb6727ffeUlbU89d1LbZmrM_

---
### 2026-04-23 15:35:21 UTC [ADVISORY]

Observed a state mismatch after updating engineer skills: agent.json contains the new skills array, but agent_get(view=config) still reports 'Skills: none'. This may indicate cached or incomplete config rendering in agent_get output.

_Context: ses_245331f71ffeKzV4vx5gLwasjh_

---
### 2026-04-25 19:23:02 UTC [BUG]

agent_update accepted skills:['architecture-analysis'] for product-owner but reported no configuration changes and agent_get still shows Skills: none. Impact: cannot confirm skill assignment through config despite skill existing in registry.

_Context: product-owner architecture skill assignment_

---
