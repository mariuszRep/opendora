---
name: tool-author
description: Guidance and templates for designing or refining tools so they have clear contracts, safe behavior, and strong agent ergonomics.
---

# Tool Authoring Skill

Use this skill when defining a new tool, improving an existing tool contract, or tightening tool behavior so agents can use it reliably.

## Variables

- `{{tool_name}}` - tool identifier
- `{{purpose}}` - what problem the tool solves
- `{{surface}}` - API shape, command contract, or invocation style
- `{{scope}}` - `new`, `rewrite`, or `improve`

---

## What A Good Tool Provides

- One clear capability with a crisp contract
- Inputs that are easy for an agent to supply correctly
- Outputs that are easy for an agent to interpret and act on
- Safe behavior around destructive or expensive operations
- Error messages that explain what failed and what to fix

## What A Tool Must Avoid

- Ambiguous parameters or overloaded meanings
- Hidden side effects that are not obvious from the contract
- Output formats that bury the actionable result
- Mixing discovery, mutation, and execution in confusing ways
- Requiring agents to guess defaults that should be explicit

---

## Tool Design Checklist

- [ ] The tool has one primary job
- [ ] Required parameters are minimal and explicit
- [ ] Optional parameters have safe defaults
- [ ] Output format is structured enough for follow-up decisions
- [ ] Errors distinguish invalid input, missing resources, and runtime failures
- [ ] Read-only and mutating behaviors are clearly separated
- [ ] Any destructive action is deliberate and well-signposted

---

## Contract Template

```markdown
Tool: {{tool_name}}

Purpose:
- [What the tool does]

Inputs:
- `required_field` - [meaning, type, constraints]
- `optional_field` - [meaning, type, default]

Behavior:
- [What happens on success]
- [What happens on missing or invalid input]
- [What side effects occur]

Output:
- [Shape of the returned result]
- [What fields are guaranteed]

Errors:
- [Validation error]
- [Not found error]
- [Runtime failure]
```

---

## Authoring Guidance

### Inputs

- Prefer small, typed inputs over free-form blobs unless free-form is the job
- Make required data explicit rather than inferred when safety matters
- Avoid parameters that can mean multiple different things

### Outputs

- Put the most important result at the top level
- Return metadata only when it helps the next decision
- Keep success and error shapes consistent enough to inspect quickly

### Safety

- Separate read-only inspection from mutations when possible
- Require explicit confirmation for irreversible actions
- Make defaults conservative

### Agent Ergonomics

- Use names that match intent plainly
- Design outputs so the next action is obvious
- Prefer predictable, stable formats over cleverness

---

## Retrospective And Experiment Use

When improving a tool:

1. Use retrospective analysis on sessions that called the tool to find misuse, ambiguity, or waste
2. Identify whether the issue is contract design, error handling, or output clarity
3. Make one targeted change to the tool definition or surrounding guidance
4. Run one improvement experiment against the workflow that uses the tool
5. Keep the change only if it improves correctness, efficiency, or reliability

---

## Steps

1. Define the tool's single responsibility
2. Draft or review the contract: inputs, behavior, outputs, errors
3. Remove ambiguity and unsafe defaults
4. Ensure the tool is easy for agents to call correctly
5. Verify the contract supports retrospective analysis and targeted experiments
6. If requested, pair the change with a concrete test workflow
