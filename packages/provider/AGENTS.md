# AGENTS.md - @projectflows/provider

Rules for agents working in `packages/provider`.

## Scope

- This package owns provider catalog loading, provider authentication, model resolution, SDK construction, provider-specific model transforms, and provider fallback state.
- Runtime packages should ask this package for resolved provider/model data instead of interpreting provider IDs, model IDs, fallback groups, auth, or SDK details themselves.
- UI and CLI code may list and store model references, but provider-specific behavior belongs here.

## Editing Guidance

- Keep provider-specific conditionals inside this package unless the caller is only displaying provider data.
- Do not move session orchestration, tool execution, permissions, or agent storage into this package.
- If a model-selection policy changes that has migration implications, create or update a GOAL.md in `.projectflows/goals/` rather than maintaining a standalone migration document.
- Preserve existing provider behavior unless the task explicitly changes it.

## Error classification — OpenCode Zen 401 "No provider available"

`ProviderError.parseAPICallError()` in `src/provider/error.ts` classifies API errors by HTTP
status code into semantic `ErrorKind` values that drive retry behavior and fallback eligibility.

**Special case:** OpenCode Zen's router (`opencode.ai/zen/v1/chat/completions`) returns **HTTP 401**
with a structured `ModelError` body (`{type:"error", error:{type:"ModelError", message:"No provider available"}}`)
when no upstream provider is available for the requested model. This is a **transient
router-capacity issue**, not a credential failure. Without special handling, the 401 status code
alone would classify it as `"auth"` (24 h cooldown, non-retryable, no fallback), killing the
session.

The `isOpenCodeZenModelUnavailable()` helper in `error.ts` detects this case narrowly:
- Provider ID starts with `"opencode"`
- HTTP status 401
- Response body matches the exact structured `ModelError` shape

When matched, `parseAPICallError()` overrides `errorKind` to `"server"` and `isRetryable` to
`true`, enabling retries and fallback switching.

**This must stay in sync with two other classification sites** in `@projectflows/session`:
- `message-v2.ts` → `fromError()` — sets `isRetryable: true` on the `MessageV2.APIError`
- `processor.ts` → `classifyErrorKind()` — returns `"server"` instead of `"auth"`

See `packages/session/AGENTS.md` → "Error classification" section for full details.

**Known upstream issues:**
- https://github.com/anomalyco/opencode/issues/33229
- https://github.com/anomalyco/opencode/issues/30192
- https://github.com/anomalyco/opencode/issues/38257
