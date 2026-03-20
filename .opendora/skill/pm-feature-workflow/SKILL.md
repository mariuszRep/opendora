---
name: pm-feature-workflow
description: Project Manager skill for orchestrating end-to-end feature implementation through coordinated sub-sessions with specialized agents
---

# PM Feature Workflow Skill

This skill enables a Project Manager agent to orchestrate the complete lifecycle of a feature implementation through a series of coordinated sub-sessions, each handled by specialized agents.

## Workflow Overview

The PM agent coordinates feature development through the following phases:

1. **Business Analysis** - Requirements gathering and refinement
2. **Architecture** (conditional) - Technical design if needed
3. **Senior Development** - Code exploration and planning
4. **Implementation** - Feature development
5. **Review** - Code review and quality checks
6. **Testing** - Verification and testing

## Sub-Session Architecture

Each phase runs in its own sub-session, owned by the PM session. The PM coordinates handoffs between phases and ensures quality gates are met before proceeding.

### Phase 1: Business Analysis

**Agent**: Business Analyst (BA)
**Sub-session**: `feature-{name}-ba`

**Objectives**:
- Work with the user to understand requirements
- Document functional specifications
- Define acceptance criteria
- Clarify edge cases and constraints

**Completion Criteria**:
- User approves requirements
- Acceptance criteria are clear
- BA submits requirements document to PM

**PM Actions**:
1. Create BA sub-session using session management tools
2. Delegate requirements gathering to BA agent
3. Review BA output when complete
4. Obtain user approval before proceeding

### Phase 2: Architecture (Conditional)

**Agent**: Architect
**Sub-session**: `feature-{name}-arch`

**Objectives**:
- Design technical architecture for the feature
- Identify components and interfaces
- Plan data models and APIs
- Document architectural decisions

**Completion Criteria**:
- Architecture design is complete
- Technical approach is validated
- Architect submits design to PM

**PM Actions**:
1. Evaluate if architecture phase is needed based on feature complexity
2. If needed, create Architect sub-session
3. Provide BA requirements to Architect
4. Review and approve architecture
5. If not needed, skip to Senior Dev phase

### Phase 3: Senior Development Planning

**Agent**: Senior Developer
**Sub-session**: `feature-{name}-senior-dev`

**Objectives**:
- Explore existing codebase
- Identify files and modules to modify
- Create detailed implementation plan
- Estimate complexity and risks

**Completion Criteria**:
- Code exploration complete
- Implementation plan documented
- File list and change scope identified
- Senior Dev submits plan to PM

**PM Actions**:
1. Create Senior Dev sub-session
2. Provide requirements and architecture (if available)
3. Review implementation plan
4. Approve plan before implementation

### Phase 4: Implementation

**Agent**: Developer (Build Agent)
**Sub-session**: `feature-{name}-implementation`

**Objectives**:
- Implement the feature according to plan
- Write clean, maintainable code
- Follow coding standards
- Create necessary tests

**Completion Criteria**:
- Feature code is complete
- Unit tests pass
- Code follows standards
- Developer submits for review

**PM Actions**:
1. Create Implementation sub-session
2. Provide implementation plan from Senior Dev
3. Monitor progress
4. Collect implementation artifacts

### Phase 5: Code Review

**Agent**: Reviewer
**Sub-session**: `feature-{name}-review`

**Objectives**:
- Review code quality
- Check for bugs and security issues
- Verify adherence to standards
- Suggest improvements

**Completion Criteria**:
- Code review complete
- Issues documented
- Approval or revision requests submitted
- Reviewer submits feedback to PM

**PM Actions**:
1. Create Review sub-session
2. Provide implementation code for review
3. Evaluate review feedback
4. Decide if revisions needed or proceed to testing

### Phase 6: Testing

**Agent**: QA/Tester
**Sub-session**: `feature-{name}-testing`

**Objectives**:
- Verify feature functionality
- Test edge cases
- Validate acceptance criteria
- Document test results

**Completion Criteria**:
- All tests pass
- Acceptance criteria met
- Test report submitted
- Tester confirms feature ready

**PM Actions**:
1. Create Testing sub-session
2. Provide acceptance criteria and implementation
3. Review test results
4. Mark feature complete or request fixes

## PM Orchestration Protocol

### Session Creation Pattern

For each phase, the PM should:

```
1. Create sub-session with appropriate naming:
   - Use session management tools
   - Name: "feature-{feature-name}-{phase}"
   - Set parent session to current PM session

2. Configure sub-session:
   - Assign appropriate agent
   - Set context from previous phases
   - Define completion criteria

3. Monitor sub-session:
   - Track progress
   - Handle blockers
   - Communicate with user as needed

4. Collect results:
   - Retrieve sub-session output
   - Validate completion criteria
   - Document decisions

5. Handoff to next phase:
   - Package relevant artifacts
   - Brief next agent
   - Set expectations
```

### Decision Gates

The PM must make go/no-go decisions at each phase:

- **After BA**: Are requirements clear and approved?
- **After Arch**: Is technical approach sound? (or skip if not needed)
- **After Senior Dev**: Is implementation plan feasible?
- **After Implementation**: Is code complete and ready for review?
- **After Review**: Are issues acceptable or need fixes?
- **After Testing**: Does feature meet acceptance criteria?

### Communication Protocol

The PM should:
- Keep user informed of progress
- Escalate blockers immediately
- Request user input at decision gates
- Provide status updates between phases
- Document all decisions and rationale

## Tools and Capabilities

The PM agent should use:
- **Session management tools**: Create, switch, search sub-sessions
- **Agent management tools**: Assign appropriate agents to phases
- **Delegation tools**: Hand off work to specialized agents
- **Communication tools**: Update user on progress

## Example Workflow Execution

```
PM receives feature request: "Add user authentication"

1. PM creates BA sub-session
   - BA works with user to define auth requirements
   - BA documents: login, logout, password reset, 2FA
   - User approves requirements

2. PM evaluates complexity → Architecture needed
   - PM creates Architect sub-session
   - Architect designs: JWT tokens, session management, DB schema
   - PM approves architecture

3. PM creates Senior Dev sub-session
   - Senior Dev explores auth libraries and existing code
   - Senior Dev plans: auth middleware, user model, API endpoints
   - PM approves plan

4. PM creates Implementation sub-session
   - Developer implements auth system
   - Developer writes tests
   - Code complete

5. PM creates Review sub-session
   - Reviewer checks security, code quality
   - Minor issues found and documented
   - PM decides issues are acceptable

6. PM creates Testing sub-session
   - Tester verifies all auth flows
   - Tests pass acceptance criteria
   - Feature approved

7. PM marks feature complete
   - Summarizes all phases
   - Documents final state
   - Closes feature session
```

## Best Practices

1. **Clear Handoffs**: Each phase should produce clear, documented output
2. **User Involvement**: Engage user at key decision points
3. **Quality Gates**: Don't skip phases or rush through reviews
4. **Documentation**: Maintain clear record of decisions and changes
5. **Flexibility**: Adapt workflow based on feature complexity
6. **Communication**: Keep all stakeholders informed

## Error Handling

If a phase fails or gets blocked:
1. PM identifies the issue
2. PM communicates with user
3. PM decides: retry, revise, or escalate
4. PM adjusts plan as needed
5. PM documents the resolution

## Success Metrics

A successful feature workflow should:
- Meet all acceptance criteria
- Pass code review
- Pass all tests
- Be delivered on time
- Maintain code quality
- Satisfy user requirements
