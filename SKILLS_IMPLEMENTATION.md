# Skills Implementation in OpenDora

## Summary

Skills are now **fully functional** in OpenDora. This document describes the implementation, verification, and usage of the skills system, including the new PM (Project Manager) agent with the feature workflow skill.

## What Was Done

### 1. Fixed Skill Tool Integration

**Issue**: The skill tool (`SkillTool`) was registered in the tool registry but wasn't receiving the required host services in the tool execution context.

**Solution**: Modified `@/home/ubuntu/projects/opendora/packages/opencode/src/session/prompt.ts:774-800` to include host services in the tool context's `extra` field:

```typescript
extra: { 
  model: input.model, 
  bypassAgentCheck: input.bypassAgentCheck,
  directory: Instance.directory,
  worktree: Instance.worktree,
  skills: {
    all: () => Skill.all(),
    get: (name: string) => Skill.get(name),
  },
  agents: {
    list: () => Agent.list(),
    get: (id: string) => Agent.get(id),
    create: (id: string, config: any, persona?: string, injection?: string) => Agent.create(id, config, persona, injection),
    update: (id: string, patch: any, persona?: string, injection?: string) => Agent.update(id, patch, persona, injection),
    remove: (id: string) => Agent.remove(id),
  },
  config: {
    get: () => Config.get(),
    directories: () => Config.directories(),
  },
  containsPath: (p: string) => Instance.containsPath(p),
}
```

### 2. Created Skills

#### Test Skill
**Location**: `@/home/ubuntu/projects/opendora/.opencode/skill/test-skill/SKILL.md`

A simple test skill to verify the skill loading mechanism works correctly.

#### PM Feature Workflow Skill
**Location**: `@/home/ubuntu/projects/opendora/.opencode/skill/pm-feature-workflow/SKILL.md`

A comprehensive workflow skill for Project Managers to orchestrate end-to-end feature implementation through coordinated sub-sessions.

**Workflow Phases**:
1. **Business Analysis** - Requirements gathering with BA agent
2. **Architecture** (conditional) - Technical design with Architect agent
3. **Senior Development** - Code exploration and planning with Senior Dev agent
4. **Implementation** - Feature development with Developer agent
5. **Code Review** - Quality checks with Reviewer agent
6. **Testing** - Verification with QA/Tester agent

### 3. Created PM Agent Template

**Location**: `@/home/ubuntu/projects/opendora/packages/agent/src/templates/pm.ts`

A new agent template that will be automatically seeded when OpenDora initializes agents. The PM agent is configured with:

- **Mode**: Primary agent
- **Skills**: `pm-feature-workflow`
- **Tools**: Full suite including session management, agent management, delegation, and skill loading
- **Temperature**: 0.7 (balanced creativity and consistency)
- **Max Steps**: 50 (for complex multi-phase workflows)

## Verification

Skills were verified to be working using the debug command:

```bash
bun run opencode debug skill
```

Output confirmed both skills are discoverable and loadable:
- ✅ `test-skill` - Successfully loaded
- ✅ `pm-feature-workflow` - Successfully loaded with full content

## How to Use Skills

### For Agents

Agents can load skills using the `skill` tool:

```typescript
// Load a skill by name
skill({ name: "pm-feature-workflow" })
```

When loaded, the skill content is injected into the agent's context, providing detailed instructions and workflows.

### For PM Agent

The PM agent is pre-configured to use the `pm-feature-workflow` skill. When a feature request is received:

1. PM loads the skill: `skill({ name: "pm-feature-workflow" })`
2. PM follows the workflow protocol defined in the skill
3. PM creates sub-sessions for each phase
4. PM coordinates handoffs between specialized agents
5. PM ensures quality gates are met before proceeding

### Creating New Skills

Skills are markdown files with YAML frontmatter located in:
- `.opencode/skill/*/SKILL.md` (project-level)
- `.claude/skills/*/SKILL.md` (external, Claude-compatible)
- `.agents/skills/*/SKILL.md` (external, agent-compatible)
- `~/.opencode/skill/*/SKILL.md` (global)

**Format**:
```markdown
---
name: skill-name
description: Brief description of the skill
---

# Skill Content

Detailed instructions, workflows, and guidance for agents.
```

## Architecture

### Skill Discovery

Skills are discovered from multiple locations in this order (later overwrites earlier):

1. Global external skills: `~/.claude/skills/`, `~/.agents/skills/`
2. Project external skills: `.claude/skills/`, `.agents/skills/`
3. OpenCode skills: `.opencode/skill/`, `.opencode/skills/`
4. Custom paths from config: `config.skills.paths`
5. Remote skills: `config.skills.urls`

### Skill Loading

The `SkillTool` (`@/home/ubuntu/projects/opendora/packages/tools/system/skill.ts`):
1. Receives skill name from agent
2. Retrieves skill from host services
3. Requests permission to load skill
4. Returns skill content with metadata and file listing

### Host Services Integration

Host services are provided through the tool context's `extra` field, making skills, agents, config, and other services available to all tools during execution.

## PM Agent Workflow Example

```
User: "Implement user authentication feature"

PM Agent:
1. Loads pm-feature-workflow skill
2. Creates BA sub-session → BA gathers requirements
3. Evaluates complexity → Creates Architect sub-session
4. Architect designs auth system → PM approves
5. Creates Senior Dev sub-session → Plans implementation
6. Creates Implementation sub-session → Developer builds feature
7. Creates Review sub-session → Reviewer checks code
8. Creates Testing sub-session → Tester verifies functionality
9. PM marks feature complete
```

## Next Steps

### To Use the PM Agent

The PM agent template has been created and will be automatically seeded when you:
1. Start OpenDora in a fresh project directory, OR
2. The agent system initializes and detects it's a first run

Once seeded, you can:
```bash
# List all agents (PM should appear)
bun run opencode agent list

# Use PM agent for a feature
bun run opencode --agent pm

# Debug PM agent configuration
bun run opencode debug agent pm
```

### To Create Additional Specialized Agents

For the full PM workflow, you may want to create additional agent templates:
- **BA (Business Analyst)** - Requirements gathering
- **Architect** - Technical design
- **Senior Dev** - Code exploration and planning
- **Reviewer** - Code review
- **QA/Tester** - Testing and verification

These can be created following the same pattern as the PM agent template.

### To Extend Skills

Create new skills for different workflows:
- **Bug Fix Workflow** - Systematic bug investigation and resolution
- **Refactoring Workflow** - Code improvement and optimization
- **Documentation Workflow** - Comprehensive documentation generation
- **Migration Workflow** - Technology or framework migrations

## Files Modified

1. `@/home/ubuntu/projects/opendora/packages/opencode/src/session/prompt.ts` - Added host services to tool context
2. `@/home/ubuntu/projects/opendora/packages/agent/src/templates/pm.ts` - Created PM agent template
3. `@/home/ubuntu/projects/opendora/packages/agent/src/templates/index.ts` - Registered PM template

## Files Created

1. `@/home/ubuntu/projects/opendora/.opencode/skill/test-skill/SKILL.md` - Test skill
2. `@/home/ubuntu/projects/opendora/.opencode/skill/pm-feature-workflow/SKILL.md` - PM workflow skill
3. `@/home/ubuntu/projects/opendora/packages/agent/src/templates/pm.ts` - PM agent template
4. `@/home/ubuntu/projects/opendora/SKILLS_IMPLEMENTATION.md` - This documentation

## Conclusion

✅ **Skills are fully functional** in OpenDora  
✅ **PM agent template created** with feature workflow skill  
✅ **Host services integrated** for skill and agent management  
✅ **Workflow documented** for end-to-end feature implementation  

The PM agent is ready to orchestrate complex feature implementations through coordinated sub-sessions with specialized agents.
