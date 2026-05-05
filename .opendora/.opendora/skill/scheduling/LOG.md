# LOG — Skill: scheduling

---

### 2026-05-05 09:57:39 UTC [ADVISORY]

Scheduling workflow biases toward target_agent and does not instruct agents to attach schedules to current/parent session by default. In session-driven contexts this caused schedule_create to be called with agent_id only instead of session_id, producing agent-owned schedules not attached to the conversation.

_Context: ses_208b09572ffePnO5ozx6ZO2Fa4_

---
