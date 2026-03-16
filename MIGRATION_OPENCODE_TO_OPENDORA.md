# OpenCode to OpenDora Migration

## Summary

Successfully migrated core directory and naming references from "opencode" to "opendora" throughout the codebase. The project is now consistently using OpenDora branding for user-facing elements while maintaining backward compatibility where needed.

## Changes Made

### 1. Directory Structure Migration

**Skills Directory**
- Changed from: `.opencode/skill/`
- Changed to: `.opendora/skill/`
- Location: `packages/opencode/src/skill/skill.ts`
- Pattern updated: `OPENCODE_SKILL_PATTERN` → `OPENDORA_SKILL_PATTERN`

**Config Directories**
- Changed from: `.opencode/`
- Changed to: `.opendora/`
- Files updated:
  - `packages/opencode/src/config/paths.ts` - Directory discovery
  - `packages/opencode/src/config/config.ts` - Config loading
  - `packages/opencode/src/config/tui.ts` - TUI config

**Agent Paths**
- Changed from: `/.opencode/agent/`, `/.opencode/agents/`
- Changed to: `/.opendora/agent/`, `/.opendora/agents/`
- Location: `packages/opencode/src/config/config.ts`

### 2. CLI Command References

Updated all user-facing CLI command references in tips and documentation:
- `opencode` → `opendora` (in user-facing messages)
- File: `packages/opencode/src/cli/cmd/tui/component/tips.tsx`

Examples:
- `opencode run` → `opendora run`
- `opencode serve` → `opendora serve`
- `opencode agent create` → `opendora agent create`
- `opencode upgrade` → `opendora upgrade`

### 3. Configuration Files

**Config File Names**
- Changed from: `opencode.json`, `opencode.jsonc`
- Changed to: `opendora.json`, `opendora.jsonc`
- Location: `packages/opencode/src/config/config.ts`

**Config Paths**
- Changed from: `~/.config/opencode/`
- Changed to: `~/.config/opendora/`
- Documentation updated in comments

### 4. Branding Updates

- "OpenCode" → "OpenDora" in user-facing messages
- Documentation URLs updated: `opencode.ai` → `opendora.ai`
- Product name references updated throughout tips

### 5. PM Agent and Skills Created

**PM Agent**
- Location: `.opendora/agents/pm/`
- Files:
  - `agent.json` - Agent configuration
  - `PERSONA.md` - Agent persona and instructions
- Configuration:
  - Mode: primary
  - Skills: pm-feature-workflow
  - Tools: Full suite including session management, delegation, skill loading
  - Temperature: 0.7
  - Max steps: 50

**Skills**
- Location: `.opendora/skill/`
- Skills created:
  - `test-skill/` - Test skill for verification
  - `pm-feature-workflow/` - Complete PM workflow for feature implementation

## Files Modified

### Core Runtime
1. `packages/opencode/src/skill/skill.ts` - Skill discovery patterns
2. `packages/opencode/src/config/paths.ts` - Config directory paths
3. `packages/opencode/src/config/config.ts` - Config loading and agent paths
4. `packages/opencode/src/config/tui.ts` - TUI config paths

### User Interface
5. `packages/opencode/src/cli/cmd/tui/component/tips.tsx` - CLI command references and tips

## Files Created

1. `.opendora/agents/pm/agent.json` - PM agent configuration
2. `.opendora/agents/pm/PERSONA.md` - PM agent persona
3. `.opendora/skill/test-skill/SKILL.md` - Test skill
4. `.opendora/skill/pm-feature-workflow/SKILL.md` - PM workflow skill
5. `packages/agent/src/templates/pm.ts` - PM agent template
6. `MIGRATION_OPENCODE_TO_OPENDORA.md` - This document

## What Still Uses "opencode"

The following intentionally still use "opencode" for backward compatibility or technical reasons:

1. **Package name**: `packages/opencode/` - Internal package structure
2. **Binary name**: `bin/opencode` - Actual executable (aliased as `opendora` in package.json)
3. **Environment variables**: `OPENCODE_*` flags - Internal configuration
4. **Import paths**: `@opencode-ai/*` - NPM package namespace
5. **Some internal references** - Code that doesn't face users

## Testing

To verify the migration:

1. **Start the server**:
   ```bash
   bun run dev:ui
   ```

2. **Check PM agent is visible**:
   - Navigate to http://localhost:3000/dashboard/settings/agents
   - PM agent should appear in the list

3. **Verify skills are loaded**:
   - Skills should be discoverable from `.opendora/skill/`
   - PM agent should be able to load `pm-feature-workflow` skill

4. **Test agent creation**:
   - Create a new agent via UI
   - Files should be created in `.opendora/agents/`

## Next Steps

### Optional Future Work

1. **Complete CLI binary rename**: Rename actual binary from `opencode` to `opendora`
2. **Environment variables**: Migrate `OPENCODE_*` to `OPENDORA_*` (with fallback)
3. **Package rename**: Consider renaming `packages/opencode` to `packages/core`
4. **Schema URLs**: Update any remaining schema URLs to opendora.ai domain
5. **Test updates**: Update test fixtures to use `.opendora` instead of `.opencode`

### Immediate Use

The PM agent is now ready to use:

1. Select "pm" agent in the UI
2. Request a feature implementation
3. PM will load the workflow skill and orchestrate the development process through coordinated sub-sessions

## Migration Impact

- ✅ **User-facing**: All user-visible references now say "OpenDora"
- ✅ **Directory structure**: Uses `.opendora/` for agents and skills
- ✅ **CLI commands**: Documentation shows `opendora` command
- ✅ **Config files**: Uses `opendora.json` naming
- ⚠️ **Backward compatibility**: Internal code still references "opencode" where needed
- ⚠️ **Binary**: Actual binary is still `opencode` but aliased as `opendora` in package.json

## Conclusion

The migration successfully updates OpenDora to use consistent branding and directory structure while maintaining internal compatibility. Users will now see "OpenDora" and `.opendora/` throughout their experience, while the codebase maintains stability through careful migration of only user-facing elements.
