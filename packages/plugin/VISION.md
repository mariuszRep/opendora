# VISION.md — packages/plugin

> Owner: human. Approved intent only.

## Intent

Plugin owns installable extension package semantics for Projectflows. Plugins are first-class catalog-managed entities and the packaging/distribution unit for contributed agents, skills, tools, workflows, MCP integrations, configuration, permissions, and optional UI extension surfaces.

## Owns

- Plugin manifest schema.
- Plugin install, uninstall, update, enable, disable, and resolution lifecycle.
- Plugin lock/index metadata.
- Relationship between plugins and contributed catalog-managed entities.
- Source/provenance metadata for plugin-contributed agents, skills, tools, and workflows.
- Local/global/project install scope semantics.

## Does Not Own

- Agent, skill, tool, or workflow domain behavior.
- Runtime execution.
- Permission evaluation.
- Physical persistence backend choice.
- Public API routing.

## Boundary Rules

- Plugins package capabilities; they do not absorb the domain ownership of contributed entities.
- A plugin may contribute agents, skills, tools, workflows, MCP integrations, schedules, configuration, permissions, and UI extension surfaces.
- Agents, skills, tools, workflows, and plugins must participate in one unified discovery/index model.
- Installing or removing a plugin must preserve and update source provenance for contributed entities.
- The projectflows.ai catalog is the canonical published catalog/index after migration.
- The legacy `projectflows-plugins` repository is migration source material until parity is confirmed.

## Canonical Operations

Plugin management tools, SDK routes, server routes, runtime loading, and app management surfaces must use plugin-owned operations for install, uninstall, list, enable, disable, update, resolve, and metadata/index behavior.
