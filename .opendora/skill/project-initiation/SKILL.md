---
name: project-initiation
description: Set up a newly approved project so implementation can begin on top of a clean working foundation. Load this for approved new-project or existing-project foundation work before feature delivery.
---

# Project Initiation

Use this skill when a new project has approved requirements and needs delivery setup before feature work begins.

## Objective

- Turn an approved project definition into a ready-to-build project workspace.
- Establish the delivery foundation before feature-by-feature execution begins.
- Coordinate setup through direct execution and focused skills rather than routine agent handoffs.

## Inputs

- Approved project requirements
- Any non-negotiable constraints on stack, hosting, repo shape, or tooling
- The current project folder or requested destination, if known
- The current reply-routing context

## Steps

1. Confirm the project is approved for delivery setup. If approval or requirements are incomplete, return it to the product authority.
2. Determine if this is a new project or an existing project:
   - New: the request implies creating a fresh project directory.
   - Existing: the request references an existing codebase, repository, package, or folder.
3. Load project context when working inside or around an existing project folder.
4. For new projects, create the project directory and initialize the minimum structure using the approved stack and repository conventions.
5. For existing projects, verify the current repository structure, setup files, and documented operating guidance are usable.
6. Identify the minimum foundation needed before feature implementation can start.
7. Execute setup directly where safe; load exploration or architecture skills when the foundation depends on understanding an existing codebase or technical boundary.
8. Verify that the core project structure is in place and usable.
9. Report readiness and identify the first appropriate feature-delivery step.

## Foundation Checklist

Tailor the list to the project, but typically confirm:

- Repository or workspace exists and is usable
- Initial folder structure matches the approved shape
- Version control is initialized or connected as expected
- Core project metadata and baseline tooling are present
- Required context documentation is present or reported as context debt
- The project has a clear starting point for first feature delivery

## Git Setup

If this is a new project repository and the initiation workflow provides setup scripts, use them when they match the approved repository shape:

1. Run `init-repo.sh` to initialize git, create the main branch, and optionally connect a remote.
2. Run `verify-clean.sh` to ensure clean working state before proceeding.

Scripts, when present, live in the `scripts/` folder alongside this skill.

## Skill-First Coordination

- Use skills before agents for setup phases that are repeatable workflows.
- Use project context for folder guidance, documentation expectations, and migration boundaries.
- Use code exploration when the existing structure is unclear.
- Use architecture analysis when foundational technical decisions are not obvious from the approved brief.

## Rules

- Do not build product features during initiation unless the setup step itself requires a tiny bootstrap artifact.
- Do not treat missing requirements as a setup problem.
- Keep the initiation scope to foundation, readiness, and delivery structure.
- Do not delegate routine setup or discovery when an attached skill can guide the work.
- End by stating whether the project is ready for feature execution.

## Output

When complete, provide:

- What project foundation was created or verified
- Which skills or checks were used
- Any remaining blockers before feature work can start
- The recommended next delivery step
