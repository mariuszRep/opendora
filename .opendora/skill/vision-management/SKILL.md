---
name: vision-management
description: Manages VISION.md files across project hierarchy, ensures sync, updates, and guidelines for content.
origin: opendora
---

# Vision Management Skill

---
name: vision-management
description: Manage and synchronize VISION.md files throughout a project's folder hierarchy, providing guidelines for content and updates.
---

## Purpose
This skill ensures that every folder in a project's directory tree has an appropriate `VISION.md` file that describes the purpose, scope, and direction of that component. It keeps the root `VISION.md` high‑level and references sub‑folder visions, while sub‑folder files contain detailed specifics.

## When to Load
- When a new project is created or a new package/sub‑module is added.
- When a developer updates the scope or direction of a component.
- During periodic audits to verify that all `VISION.md` files exist and are consistent.

## Variables
- `{{project_root}}` – Absolute path to the project's root directory.
- `{{target_path}}` (optional) – Specific sub‑folder to create or update a vision for. If omitted, the skill operates on the whole tree.
- `{{content}` – Desired content for the `VISION.md` (if creating/updating a specific file).

## Steps
1. **Discover Tree** – Recursively list all directories under `{{project_root}}`.
2. **Check Existence** – For each directory, verify whether a `VISION.md` exists.
3. **Create Missing** – For any missing file, create a scaffold:
   ```markdown
   # Vision for {{dir_name}}
   ## Purpose
   *Describe the high‑level purpose of this component.*
   ## Scope
   *What is in‑scope / out‑of‑scope?*
   ## Relationships
   *How does this component relate to others?*
   ```
4. **Synchronize Root** – Ensure the root `VISION.md` contains only high‑level goals and a table of contents linking to each sub‑folder vision.
5. **Update Content** – If `{{content}}` is provided, overwrite the target file with the supplied content, preserving the scaffold sections.
6. **Validate** – Run basic checks:
   - Non‑empty `Purpose` and `Scope` sections.
   - No duplicate headings.
   - Links in the root file resolve to existing sub‑files.
7. **Report** – Summarize actions taken (files created, updated, already correct) and any validation warnings.

## Rules & Guidelines
- **Root Vision** must never duplicate detailed logic from sub‑folders; it should reference them.
- **Sub‑folder Vision** must be self‑contained, describing only that component.
- **Never delete** an existing `VISION.md` without explicit user confirmation.
- **Keep files near code** – place the file directly in the same directory as the source it describes.
- **Version Control Friendly** – only modify files that changed; avoid re‑formatting unchanged files.

## Verification
After execution, run `git status` (or equivalent) to show modified `VISION.md` files. If any validation step fails, abort and present the issues to the user for manual resolution.

## Tools Required
- `read` / `write` filesystem access
- `glob` for directory enumeration
- `git` (optional) for status reporting

---

*This skill is intended to be attached to the Product Owner role and used alongside the `requirements` skill during project initialization.*