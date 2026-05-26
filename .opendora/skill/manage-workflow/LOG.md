# LOG — Skill: manage-workflow

---

### 2026-05-26 09:27:13 UTC [BUG]

Skill reports workflow_list/workflow_get/workflow_create/workflow_update/workflow_delete as registered after skill_load, but runtime tool surface in this session exposes only workflow_run. Attempting comprehensive CRUD test is blocked by missing tool bindings.

_Context: ses_19c66070cffeH216d7S1JrPIOr_

---
