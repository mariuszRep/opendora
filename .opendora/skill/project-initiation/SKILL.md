---
name: project-initiation
description: Set up a newly approved project so implementation can begin on top of a clean working foundation.
---

# Project Initiation

Use this skill when a new project has approved requirements and needs delivery setup before feature work begins.

## Objective

- Turn an approved project definition into a ready-to-build project workspace.
- Establish the delivery foundation before feature-by-feature execution begins.

## Inputs

- Approved project requirements
- Any non-negotiable constraints on stack, hosting, repo shape, or tooling
- The current reply-routing context

## Steps

1. Confirm the project is approved for delivery setup. If approval or requirements are incomplete, return it to the product authority.
2. Identify the minimum foundation needed to begin implementation.
3. Delegate discovery or implementation work needed to establish that foundation.
4. Verify that the core project structure is in place.
5. Report readiness and hand off future feature work to the feature-delivery workflow.

## Foundation Checklist

Tailor the list to the project, but typically confirm:

- Repository or workspace exists and is usable
- Initial folder structure matches the approved shape
- Version control is initialized or connected as expected
- Core project metadata and baseline tooling are present
- The project has a clear starting point for first feature delivery

## Git Setup (if new repository)

If this is a new project repository, use the provided scripts:

1. Run `init-repo.sh` - initializes git, creates main branch, optional remote
2. Run `verify-clean.sh` - ensures clean working state before proceeding

Scripts are in the `scripts/` folder alongside this skill.

## Delegation Defaults

- Use synchronous handoffs for setup steps because you usually need each result before deciding the next one.
- If discovery reveals a missing product decision, send that back to the product authority rather than inventing a default.
- Keep routing explicit whenever a downstream specialist should report directly past you.

## Rules

- Do not build product features during initiation unless the setup step itself requires a tiny bootstrap artifact.
- Do not treat missing requirements as a setup problem.
- Keep the initiation scope to foundation, readiness, and delivery structure.
- End by stating whether the project is ready for feature execution.

## Output

When complete, provide:

- What project foundation was created or verified
- Any remaining blockers before feature work can start
- The recommended next delivery step
