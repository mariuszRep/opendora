# Return-Path Contract Enforcement - Changes Summary

## Problem Statement

When Pandora delegates to Project Owner with `reply_to: ses_pandora`, and Project Owner then delegates to BA, the BA's replies need to surface back to Pandora. The previous instructions were not explicit enough about preserving the return path through delegation chains, leading to routing failures.

## Changes Made

### 1. Updated `delegate.txt` - Tool Instruction Layer

**File**: `packages/tools/sessions/delegate.txt`

#### Section: "CHOOSING reply_to — THE ROUTING CONTRACT" (lines 22-54)

**Before:**
```
reply_to decides where user-facing results and questions will surface.
Choosing reply_to is part of the delegation decision, not an afterthought.

DEFAULT — forward the upstream return path:
- If you received this task with a reply_to in your session context, and you are
  only forwarding it to a better-suited agent, pass that same upstream session ID
  as reply_to.
```

**After:**
```
reply_to establishes where user-facing results and questions will surface.
This is a binding contract that must be preserved through delegation chains.

CRITICAL RULE — PRESERVE THE UPSTREAM RETURN PATH:

If your session context shows "Reply to session ID: ses_xxx", that is the UPSTREAM
RETURN PATH. You have exactly TWO valid choices:

1. RESPOND DIRECTLY to that upstream session using the reply tool
2. DELEGATE FURTHER while PRESERVING that same reply_to value

You MUST NOT:
- Drop the reply_to parameter when delegating (this orphans the downstream agent)
- Replace it with your own session ID unless you meet the exception below
- Assume the downstream agent will figure out where to reply

When forwarding work to a better-suited agent:
✓ CORRECT:   delegate({ agent: "X", prompt: "...", reply_to: "ses_upstream" })
✗ WRONG:     delegate({ agent: "X", prompt: "..." })  // drops return path
✗ WRONG:     delegate({ agent: "X", prompt: "...", reply_to: "ses_your_session" })  // breaks visibility
```

**Why this fixes the Pandora → Project Owner → BA failure:**
- Makes it explicit that dropping `reply_to` is a **contract violation**
- Uses visual markers (✓/✗) to show correct vs incorrect patterns
- States "MUST NOT" instead of softer "should" language
- Clarifies that the agent has only TWO valid choices, not many options

#### Section: Examples (lines 91-115)

**Added three concrete examples:**

1. **CORRECT**: Preserving the return path
   - Shows the full chain: Pandora → Project Owner → BA → Pandora
   - Demonstrates session context at each step
   - Shows ✓ marker for correct behavior

2. **WRONG**: Dropping the return path
   - Shows what happens when `reply_to` is omitted
   - Explains the consequence: BA cannot use reply tool
   - Shows ✗ marker and labels it "CONTRACT VIOLATION"

3. **WRONG**: Intercepting the return path
   - Shows what happens when routing to self instead of upstream
   - Explains the consequence: breaks visibility
   - Shows ✗ marker and labels it "CONTRACT VIOLATION"

**Why this fixes the failure:**
- Concrete examples make the abstract rule tangible
- Shows the exact failure mode (dropping reply_to)
- Demonstrates the correct pattern with actual session IDs
- Uses the same agent names (Pandora, Project Owner, BA) as the real scenario

#### Section: RULES (lines 143-152)

**Added explicit "RETURN-PATH CONTRACT (CRITICAL)" subsection:**

```
RETURN-PATH CONTRACT (CRITICAL):
- If your session context shows "Reply to session ID: ses_xxx", you MUST either:
  1. Use reply to respond to that session, OR
  2. Pass that same ses_xxx as reply_to when delegating further
- Dropping reply_to during forwarding is a CONTRACT VIOLATION.
- Replacing reply_to with your own session breaks visibility and is WRONG unless you
  genuinely need the result back to make your own next decision.
- When in doubt: preserve and forward the upstream return path.
```

**Why this fixes the failure:**
- Elevates the rule to "CRITICAL" status
- Makes it a numbered checklist (easier to follow)
- Uses "MUST" language (unconditional requirement)
- Provides a default heuristic: "When in doubt: preserve and forward"

### 2. Updated `reply.txt` - Tool Instruction Layer

**File**: `packages/tools/sessions/reply.txt`

#### Section: "HARD RULE" (lines 8-19)

**Before:**
```
HARD RULE

If you are working on a delegated task and reply_to was provided (your session context
shows "Reply expected: silent"), any user-facing message about that task MUST use reply.

This is unconditional. There are no exceptions.
```

**After:**
```
HARD RULE — BINDING CONTRACT

If your session context shows "Reply expected: silent" and "Reply to session ID: ses_xxx",
a return-path contract exists. You MUST use reply for ANY user-facing message.

This is unconditional. There are no exceptions. No workarounds.

The upstream agent (or user) is expecting your messages to appear in session ses_xxx.
If you do not use reply, they will never see your work. Your session is invisible to
them until you surface yourself with reply.
```

**Why this reinforces the contract:**
- Emphasizes "BINDING CONTRACT" language
- Adds "No workarounds" to close loopholes
- Explains the consequence: "Your session is invisible to them"
- Makes it clear this is about visibility, not just protocol

#### Section: "HOW ROUTING WORKS" (lines 82-96)

**Added failure scenario:**

```
What happens if the contract is violated:
- If Project Owner drops reply_to when delegating to BA:
  → BA has no replyToSessionID
  → BA cannot use reply (no target)
  → BA's work is invisible to Pandora
  ✗ Contract broken: Pandora never sees BA's questions or results
```

**Why this helps:**
- Shows the downstream consequence of upstream violations
- Makes it clear that BA is not at fault (they have no target)
- Reinforces that the violation happens at delegation time, not reply time

### 3. Added Programmatic Guardrails

**File**: `packages/tools/sessions/delegate.ts` (lines 87-116)

**Added runtime detection and warnings:**

```typescript
// ── GUARDRAIL: Check for return-path contract violations ──
const currentSession = await sessionSvc.get(ctx.sessionID)
const upstreamReturnPath = currentSession?.replyToSessionID

if (upstreamReturnPath && !replyToSessionID && !wait) {
  // Agent has an upstream return path but is delegating async without preserving it
  console.warn(
    `[DELEGATE] ⚠️  RETURN-PATH CONTRACT VIOLATION DETECTED\n` +
    `  Current session: ${ctx.sessionID}\n` +
    `  Upstream return path exists: ${upstreamReturnPath}\n` +
    `  Delegating to: ${params.agent}\n` +
    `  Problem: reply_to was NOT provided - downstream agent will be orphaned\n` +
    `  Fix: Add reply_to: "${upstreamReturnPath}" to preserve the return path\n` +
    `  See delegate.txt "CHOOSING reply_to — THE ROUTING CONTRACT" for details`
  )
}

if (upstreamReturnPath && replyToSessionID && replyToSessionID !== upstreamReturnPath && replyToSessionID === ctx.sessionID) {
  // Agent is intercepting the return path (routing to self instead of upstream)
  console.warn(
    `[DELEGATE] ⚠️  RETURN-PATH INTERCEPTION DETECTED\n` +
    `  Current session: ${ctx.sessionID}\n` +
    `  Upstream return path: ${upstreamReturnPath}\n` +
    `  Delegating to: ${params.agent}\n` +
    `  reply_to provided: ${replyToSessionID} (your own session)\n` +
    `  Warning: You are intercepting the return path instead of forwarding it\n` +
    `  This breaks visibility unless you genuinely need the result back\n` +
    `  If you are only forwarding work, use reply_to: "${upstreamReturnPath}" instead`
  )
}
```

**What this detects:**

1. **Dropped return path**: Agent has upstream return path but delegates without `reply_to`
2. **Intercepted return path**: Agent routes to self instead of forwarding upstream

**Why this helps prevent future failures:**
- Catches violations at runtime, not just in documentation
- Provides actionable fix in the warning message
- Shows the exact session IDs involved
- References the documentation for context

## How This Fixes the Pandora → Project Owner → BA Routing Failure

### The Failure Scenario

1. Pandora delegates to Project Owner with `reply_to: ses_pandora`
2. Project Owner's session context shows: `"Reply to session ID: ses_pandora"`
3. Project Owner delegates to BA **without** `reply_to` parameter (or with `reply_to: ses_project_owner`)
4. BA's session has no `replyToSessionID` (or wrong one)
5. BA cannot use reply tool to surface to Pandora
6. Pandora never sees BA's work

### How the New Instructions Prevent This

**At delegation time (Project Owner → BA):**

1. **Tool instructions** now explicitly state:
   - "If your session context shows 'Reply to session ID: ses_xxx', you MUST either respond directly OR pass that same ses_xxx as reply_to"
   - "Dropping reply_to during forwarding is a CONTRACT VIOLATION"
   - Shows concrete example with ✗ marker for this exact failure

2. **Programmatic guardrail** detects:
   - Project Owner has `replyToSessionID = ses_pandora`
   - Project Owner is delegating without `reply_to`
   - Logs warning: "RETURN-PATH CONTRACT VIOLATION DETECTED"
   - Suggests fix: `Add reply_to: "ses_pandora"`

**At reply time (BA → Pandora):**

1. **Tool instructions** now explicitly state:
   - "If your session context shows 'Reply expected: silent', a return-path contract exists"
   - "Your session is invisible to them until you surface yourself with reply"
   - Shows what happens when contract is violated upstream

## Suggested Additional Guardrails

### 1. Stricter Enforcement (Optional)

Could make the warning an **error** instead of just a warning:

```typescript
if (upstreamReturnPath && !replyToSessionID && !wait) {
  throw new Error(
    `Return-path contract violation: You have an upstream return path (${upstreamReturnPath}) ` +
    `but are delegating without reply_to. Add reply_to: "${upstreamReturnPath}" to preserve the contract.`
  )
}
```

**Trade-off**: This would be stricter but might block legitimate cases where the agent genuinely wants synchronous blocking.

### 2. Auto-Correction (Optional)

Could automatically inject the upstream return path:

```typescript
if (upstreamReturnPath && !replyToSessionID && !wait) {
  console.warn(`[DELEGATE] Auto-correcting: injecting reply_to: ${upstreamReturnPath}`)
  replyToSessionID = upstreamReturnPath
}
```

**Trade-off**: This would prevent failures but might hide agent mistakes and prevent learning.

### 3. Metrics/Telemetry (Recommended)

Add metrics to track contract violations:

```typescript
if (upstreamReturnPath && !replyToSessionID && !wait) {
  metrics.increment('delegate.return_path_violation', {
    agent: ctx.agent,
    target_agent: params.agent,
    upstream_path: upstreamReturnPath
  })
}
```

**Benefit**: Helps identify which agents frequently violate the contract.

### 4. UI Warning (Recommended)

Surface the warning in the UI so users can see when routing is broken:

```typescript
await ctx.metadata({
  warning: 'return_path_violation',
  message: 'This delegation dropped the upstream return path',
  fix: `Add reply_to: "${upstreamReturnPath}"`
})
```

**Benefit**: Makes violations visible to users, not just in logs.

## Summary

The changes enforce the return-path contract through:

1. **Explicit tool-layer instructions** that make preservation mandatory
2. **Concrete examples** showing correct vs incorrect patterns
3. **Visual markers** (✓/✗) and strong language ("MUST", "CONTRACT VIOLATION")
4. **Programmatic guardrails** that detect and warn about violations at runtime
5. **Consequence explanations** that clarify why the rule matters

This is a **tool-layer fix**, not a persona-layer fix. The rules are in the shared instruction files that govern delegation and replies, not in individual agent personas or injections.
