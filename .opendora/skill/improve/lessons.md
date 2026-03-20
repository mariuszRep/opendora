# Improve Skill — Lessons

## Experiments

- **project-owner / delegation by intent (2026-03-20)**: Replaced name-based "Look for agents described as" hints with capability descriptors that reinforce intent-based routing. Added explicit rule that technical questions must not be routed to requirements or planning specialists. Baseline and post-change scores were both 4/5 (Q3 always routes to BA due to tool config constraint), but the agent's reasoning improved — it now correctly categorizes architecture questions as technical work. The original file had no delegation framework at all; the framework was introduced fresh rather than patched.

- **project-owner / delegation by intent re-check (2026-03-20)**: Re-ran 5-question baseline against the established framework. Score was 5/5 — no regression, no failure pattern. The framework correctly routes requirements/analysis work to a requirements specialist, planning/coordinating work to a planning specialist, and technical work to a technical specialist, all by intent. No change needed; the prior experiment already solved this.
