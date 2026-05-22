---
name: requirements
description: Conditional skill for unclear, incomplete, or risky requests. Uses iterative one-question-at-a-time fact-finding to reduce bias and remove unknowns. Produces concise readiness outcome for handoff. Enforces VISION.md sync gate and strict mismatch block before implementation. Applies to all artifact types including projects, agents, skills, and tools.
last_updated: 2026-05-20T00:00:00Z
---

# Requirements

Use this skill when a request is unclear, incomplete, exploratory, or carries significant risk. Not a mandatory first gate—apply conditionally based on request clarity.

## VISION.md Governance

This skill defines what VISION.md and requirements artifacts are, and enforces strict sync discipline.

### VISION.md Definition

**VISION.md IS:**
- A durable intent document describing what a folder, agent, skill, or project should be and how it should behave
- The single source of truth for approved behavioral requirements
- Process-agnostic: applies to any agent or skill folder regardless of workflow
- Updated only when user approves new intent

**VISION.md IS NOT:**
- A completion checklist or roadmap with done/not-done status
- Technical implementation instructions
- A status report or changelog of work performed
- A substitute for requirements elicitation

### Requirements Artifact Definition

**Requirements artifact IS:**
- A bounded, actionable specification produced through elicitation
- The input that drives implementation
- Owned by the requirements skill (this skill)
- Terse one-question loop style throughout

**Requirements artifact IS NOT:**
- A vision statement (that's VISION.md)
- A design document with technical architecture
- A task list or backlog
- A status update

### Conditional VISION Sync Gate

Before any implementation begins:

1. **Look for VISION.md** in the relevant folder, agent, skill, package, or project scope
2. **If present, verify alignment**: confirmed requirements must match VISION.md approved behaviors
3. **If absent, do not block solely on absence**: continue from user-supplied intent and other available context
4. **Block on mismatch**: if requirements drift from an existing VISION.md, halt and request clarification or user-approved vision update
5. **Log the sync**: record the VISION.md path/version/commit when one was present, or `not present` when absent

### Strict Mismatch Block

If implementation would violate an existing VISION.md:
- Do not proceed
- Report the specific mismatch to the user
- Request VISION.md update through user-approved intent before continuing

### User-Only Approval for VISION Changes

- Only the user (not agents) can approve VISION.md intent changes
- When VISION.md needs update, present the proposed change to user and await approval
- Do not auto-merge or agent-approve vision changes

## Objective

- Reduce ambiguity through targeted fact-finding.
- Remove unknowns that block safe execution.
- Produce a delivery-ready specification or clear blocker outcome.
- Keep elicitation iterative: ask one question, adapt based on answer.

## When to Use

Apply this skill when:
- Request is vague, missing key details, or has multiple interpretations
- Risk level is unclear or potentially high (security, data, production impact)
- Scope is ambiguous or may expand during execution
- User intent is unclear or seems to conflict with existing direction

Skip this skill when:
- Request is already clear, bounded, and low-risk
- Direct answer is possible without clarification
- Work is routine maintenance with known scope

## Complementarity with Domain Skills

This skill is universal and remains active as the requirements method, regardless of domain.

- Use this skill to control **how** requirements are elicited (question quality, confirmation loop, readiness discipline).
- When the domain is identified (for example product/software delivery), load domain skill(s) to control **what additional domain-specific requirements** must be captured.
- Do not treat domain skills as replacements for this skill; they are complementary extensions.

## Elicitation Loop

### Core Pattern

1. **Ask an open idea-first question** and let the user brain-dump intent.
2. **Lock intent**: restate exact build goal and expected outcome in one sentence.
3. **Ask for explicit confirmation** ("Did I get this right?").
4. **If corrected, loop steps 2-3** until confirmed.
5. **Ask an exhaust check**: "Anything else important before I ask specific questions?"
6. **Ask one targeted question** at a time to close remaining blockers.
7. **Repeat** until sufficient clarity for delivery or clear blocker emerges.

### Question Strategy

#### Idea-First Opening

The FIRST question in any elicitation must ask the user to describe what they are trying to achieve/build/improve. Do not ask platform, repo, feature, or solution-framing questions before understanding the user's goal.

**Example first question:** "What are you trying to build, improve, or achieve?"

Only after the user describes their intent should you ask clarifying questions about implementation details, constraints, or scope.

Focus on removing the highest-impact unknown:

1. What problem are you solving? (pain point, goal)
2. What does success look like? (desired outcome, acceptance)
3. Who is this for? (user, context)
4. What constraints apply? (non-negotiables, limits)
5. What's out of scope? (boundaries)

Ask one at a time. Never bundle. Never answer your own question.

**Intent Lock Step:** After any ambiguity or correction, confirm the exact goal before moving forward. Restate what you understand the user wants to build and achieve, then ask for explicit confirmation.

**Example confirmation question:** "To confirm, you want to build X and achieve Y, right?"

**Exhaust Check:** After intent is confirmed, ask the user if there's anything else important before you ask specific implementation questions.

**Example exhaust check:** "Anything else important before I ask specific questions?"

**Rule:** Do not ask platform, repo, or feature solution-shaping questions until intent is confirmed.

### Bias Reduction

- Do not assume intent—elicit it.
- Do not fill gaps with assumptions—ask.
- Do not push for answers the user doesn't have—record as open.
- Challenge your own interpretation: ask "Did I get that right?" before proceeding.

### Unknown Removal

- Track what is known vs. unknown.
- Unknowns that block delivery = continue eliciting.
- Unknowns that are refinements = note and proceed.
- If user says "I don't know" or "decide later", record as open question, not blocker.

## Readiness Outcome

When sufficient clarity exists, produce concise output:

```text
## Readiness: <title>

**Goal:** <what we're building>

**Scope:** <bounded deliverable>

**Acceptance:** <key criteria>

**Constraints:** <known limits>

**Open Questions:** <gaps or None>

**Status:** ready | blocked | deferred
```

If blocked, state the specific blocker clearly.

## Tool Contracts

- `question`: Ask user clarification, decisions, preferences, or approval
- `delegate`: Route to another agent for action or answer
- `reply`: Report status, summary, or handback to upstream session

Use `question` for human input. Use `delegate` for agent-to-agent. Use `reply` only when a return path exists and no response is needed.

## Rules

- Do not execute delivery work during elicitation.
- Do not hand to delivery with unresolved blockers.
- Do not invent requirements the user didn't provide.
- Do not assume technology or architecture before need is understood.
- If delivery later uncovers gaps, receive escalation back into readiness.
- Stay domain-neutral: do not perform deep product architecture, implementation planning, or execution routing in this skill.
- For product/software delivery requests, continue using this skill's elicitation method while also loading `product-architecture` to capture domain-specific architecture requirements.

## Output

Produce readiness outcome with:
- Clear goal and scope
- Bounded acceptance criteria
- Known constraints
- Open questions (if any)
- Status: ready, blocked, or deferred
