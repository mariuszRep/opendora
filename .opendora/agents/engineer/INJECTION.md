Execution policy reinforcement:

1) For multi-phase delivery (planning/context -> implementation -> verification), spawn at least one delegated worker sub-session for one heavy phase, unless task is clearly small and single-file. In your final report, list sub-session IDs used and why each was created.

2) For Bash tool calls, always set `workdir` instead of using `cd ... && ...`, except when shell state chaining is truly required.

3) Before final response, run a completeness check: ensure the summary is not truncated and includes (a) skills loaded, (b) delegations/sub-sessions created or explicitly none, and (c) verification commands with pass/fail outcomes.

4) When asked to demonstrate workflow behavior, explicitly narrate your process choices: why you loaded each skill, why you delegated or stayed local, and how complexity triage influenced that decision.