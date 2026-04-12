# Delegation Reply Contract Fix

## Problem Summary

When a user directly engaged in a delegated session (e.g., `ses_2c0ef19e8ffebm8NvHWxC7hj6G`), the agent would:
1. Still call the `reply` tool back to the upstream session
2. Also produce a local assistant message in the delegated session
3. Result in **dual-output behavior**: upstream surfacing + local continuation

## Root Cause

**Missing message attribution**: When delegation creates a user message in the target session, it wasn't setting the `from` field. This meant:

1. Delegated messages appeared without `[agent:name]` attribution prefix
2. Agent couldn't distinguish between:
   - `[agent:pandora] Please do X` (delegation from another agent)
   - `Please do X` (direct user engagement)
3. Agent treated all messages as if they needed the reply tool

The attribution system at `@/home/mariu/projects/opendora/packages/session/src/message-v2.ts:543-548` only adds `[agent:name]` prefix when `from.kind === "agent"`, but delegated messages had no `from` field set.

## The Fix

### 1. Proper Message Attribution
**File**: `@/home/mariu/projects/opendora/packages/session/src/prompt.ts:1134-1143`

When `parentMessageID` is provided (cross-session delegation), look up the parent message to get the delegating agent's ID and set `from: { kind: "agent", id: agentId }`:

```typescript
// ── DELEGATION ATTRIBUTION ──
// If this message has a parentMessageID (cross-session delegation), look up the parent
// to get the delegating agent's ID and set from.kind='agent' so [agent:name] prefix appears
let from: MessageV2.Actor | undefined
if (input.parentMessageID) {
  const parentMsg = await Session.getMessage(input.parentMessageID)
  if (parentMsg && parentMsg.role === "assistant" && parentMsg.from) {
    from = parentMsg.from
  }
}

const info: MessageV2.Info = {
  // ...
  ...(from ? { from } : {}),
  // ...
}
```

### 2. Conditional Delegation Injection (Supporting Change)

**File**: `@/home/mariu/projects/opendora/packages/tools/sessions/delegate.ts:202-212`

Also updated the delegation injection text to be more helpful:

```typescript
text: [
  `Return path: ${replyToSessionID}`,
  `When you complete this task, use the reply tool to send your results back to the requesting session.`,
  `If the user engages with you directly in this session, respond to them here instead of using reply.`,
].join("\n")
```

## How It Works

With proper attribution, the agent now sees:
- **Delegated message**: `[agent:pandora] Please analyze the codebase` 
- **Direct user message**: `Can you explain this to me?`

The agent can naturally distinguish between:
1. Messages from other agents (has `[agent:name]` prefix) → use reply tool when task is complete
2. Messages from users (no prefix) → respond locally

The conditional injection text provides additional clarity about when to use the reply tool.

## Testing Recommendations

1. **Test direct engagement**:
   - Delegate a task to BA
   - Navigate to BA's session in the UI
   - Send a direct message
   - Verify: BA responds locally, does NOT call reply upstream

2. **Test normal delegation**:
   - Delegate a task from Pandora → project-owner → BA
   - Verify: BA completes task and calls reply back to project-owner
   - Verify: project-owner surfaces result to Pandora

3. **Test mixed scenario**:
   - Delegate task to BA
   - User directly messages BA mid-task
   - BA responds locally
   - User says "please report back to the original requester"
   - BA should then use reply tool

## Files Modified

1. **`packages/session/src/prompt.ts`** (lines 1134-1152)
   - Added delegation attribution logic in `createUserMessage()`
   - Sets `from` field when `parentMessageID` is present
   - Ensures `[agent:name]` prefix appears for delegated messages

2. **`packages/tools/sessions/delegate.ts`** (lines 202-212)
   - Updated delegation injection text to be conditional
   - Provides clearer guidance on when to use reply tool
