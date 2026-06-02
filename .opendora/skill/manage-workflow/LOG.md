# LOG — Skill: manage-workflow

---

### 2026-05-26 09:27:13 UTC [BUG]

Skill reports workflow_list/workflow_get/workflow_create/workflow_update/workflow_delete as registered after skill_load, but runtime tool surface in this session exposes only workflow_run. Attempting comprehensive CRUD test is blocked by missing tool bindings.

_Context: ses_19c66070cffeH216d7S1JrPIOr_

---
### 2026-06-02 10:22:40 UTC [ADVISORY]

Intake workflow run failed after deterministic decide with opaque 'Bad Request 2 passed, 1 failed'. Inspection showed a tool node had agentArgs:['workdir']; likely caused invalid runtime arg handling for bash. Workflow tooling should surface failing node id/action and validation details, and skill guidance should warn against using agentArgs for workdir; use workflow_run top-level workdir instead.

_Context: wf-product-intake-contract-v1 bootstrap_folder_git_

---
### 2026-06-02 10:29:41 UTC [ADVISORY]

Skill should add a permanent 'workdir contract' rule: workflow parameters node declares only workflow_run.input keys; workflow_run.workdir is a top-level runner option, optional globally but effectively mandatory for workflows that use bash/filesystem/project directories. Workflow authors should state this in workflow.description/node descriptions and never put workdir in tool node agentArgs.

_Context: workflow_workdir_contract_

---
### 2026-06-02 10:47:01 UTC [ADVISORY]

Workflow authoring guidance should state that workflow_run.workdir must be an existing directory. For new-project workflows, either require caller to pre-create/pass exact project dir, or add a separate folder-name input and explicit mkdir/cd steps; downstream bash nodes must cd into that child folder because changing cwd in one bash node does not persist to later nodes.

_Context: wf-product-intake-contract-v1 v1.3.0_

---
### 2026-06-02 10:54:08 UTC [ADVISORY]

Platform gap: workflows lack a first-class node/runtime primitive to set the workflow session working directory after path creation. Current workaround is to compute project_directory in ctx and pass it as bash.workdir on every filesystem-sensitive tool node. This does not update prompt/session-level directory context and is brittle for mixed tool types.

_Context: wf-product-intake-contract-v1 v1.3.1_

---
