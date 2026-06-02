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

---
name: workflow_workdir_contract
description: Workflow workdir is a top-level run option; it must be an existing directory and must identify exact project context or parent plus folder-name input.
type: project
---
Workflow `workdir` is a top-level `workflow_run` option, not a workflow input parameter, and it should point to an existing directory.
**Why:** The workflow runner uses `workdir` as the session/tool working directory before workflow nodes execute, so a workflow cannot reliably create a non-existent `workdir` as its first step. Passing a broad parent like `/home/mariu/projects` loses the specific project context unless the workflow also receives a project/folder-name input and explicitly creates/uses that child path.
**How to apply:** For existing-project workflows, pass `workflow_run.workdir` as the exact existing project directory. For new-project workflows, either pre-create and pass the exact new project directory, or pass an existing parent directory plus a declared folder-name input such as `project_directory_name` that workflow nodes use to create and `cd` into the child folder. Do not put `workdir` in `workflow_run.input` and do not use tool-node `agentArgs` to populate it.