# Google Gemini CLI — Quota & Rate Limits

## How it works

Authentication goes through the **Code Assist API** (`cloudcode-pa.googleapis.com/v1internal`), not the standard Gemini Developer API. This means:

- Quota is managed by Google Code Assist, not by an API key
- Free-tier users get a managed GCP project (returned by `loadCodeAssist` as `cloudaicompanionProject`)
- Quota is **per-model**, per GCP project, with short rolling windows

## Observed limits (free tier)

| Model | Notes |
|---|---|
| `gemini-2.5-flash-lite` | Highest quota — best for frequent/cheap calls |
| `gemini-2.5-flash` | Moderate quota — good balance |
| `gemini-2.5-pro` | Lowest quota — expensive, hits limits fast |
| `gemini-3.*-preview` | Preview models — unknown limits |

The 429 error message includes the reset time:
```
"You have exhausted your capacity on this model. Your quota will reset after 40s."
```

The `metadata.model` field in the error details indicates which model was exhausted.

## Why we hit 429 during testing

The AI SDK (`@ai-sdk/provider-utils`) marks 429 as `isRetryable: true`. When a request fails, the SDK automatically retries — each retry consumes another request slot, accelerating quota exhaustion.

Additionally, failed requests (500s during development) accumulated a queue of unsent messages in the session, which all fired in quick succession once the implementation was fixed.

## Rate limit fields in the 429 response body

```json
{
  "error": {
    "code": 429,
    "status": "RESOURCE_EXHAUSTED",
    "details": [{
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      "reason": "RATE_LIMIT_EXCEEDED",
      "domain": "cloudcode-pa.googleapis.com",
      "metadata": {
        "uiMessage": "true",
        "model": "gemini-2.5-flash"
      }
    }]
  }
}
```

## Strategies to manage quota

### 1. Switch models on 429
When `gemini-2.5-flash` is exhausted, try `gemini-2.5-flash-lite`. The rate limit is per-model so different models have independent quotas.

### 2. Respect Retry-After
The reset time is embedded in the error message text. Parse it and back off accordingly rather than retrying immediately.

### 3. Don't auto-retry on 429
The AI SDK's default retry behavior makes things worse under rate limits. Consider configuring the provider or wrapping fetch to suppress retries on 429.

### 4. loadCodeAssist project ID
The `project` field in every `streamGenerateContent` request must match the GCP project assigned by Code Assist. Without it, requests fail with 500. Our CUSTOM_LOADER fetches this once via `loadCodeAssist` and caches it in-memory for the lifetime of the server process.

### 5. Quota tiers
Users who have Google One AI Premium or Google Workspace get paid-tier quota. The `loadCodeAssist` response's `paidTier` field indicates this. Paid-tier users have much higher limits. We do not currently surface this distinction in the UI.

## Known body transformations

### `thinkingConfig.thinkingBudget` injection

The `@ai-sdk/google` SDK sends `thinkingConfig: { includeThoughts: true }` for reasoning models — no `thinkingBudget`.

The standard Gemini API accepts this, but the Vertex API (used by Code Assist) rejects it:
> `thinking_config.include_thoughts is only enabled when thinking is enabled`

**Fix applied in CUSTOM_LOADER:**

- For **non-reasoning models** (`gemini-2.5-flash-lite`): strip `thinkingConfig` entirely — these models don't support thinking at all and Vertex rejects any `thinkingConfig` presence.
- For **reasoning models** (`gemini-2.5-flash`, `gemini-2.5-pro`, etc.): inject `thinkingBudget: -1` (dynamic — model decides how much thinking to use) when `includeThoughts: true` is present without a budget.

## Request flow (our implementation)

```
UI → opencode session → @ai-sdk/google SDK
  → builds: POST /{version}/models/{model}:{method}?alt=sse
  → body: { generationConfig, contents, systemInstruction, tools, ... }

Our custom fetch intercepts:
  1. Swap x-goog-api-key → Authorization: Bearer <oauth-token>
  2. Rewrite URL: /v1internal/models/{model}:streamGenerateContent
              →  /v1internal:streamGenerateContent
  3. Wrap body: { model, project, user_prompt_id, request: <original-body> }
  4. Forward to cloudcode-pa.googleapis.com

Response SSE transform:
  Code Assist: data: { "response": { candidates, usageMetadata }, "traceId" }
  We strip outer: data: { candidates, usageMetadata }
  → @ai-sdk/google parses normally
```

## Files

| File | Purpose |
|---|---|
| `google-oauth-plugin.ts` | Plugin: auth loader, model list, OAuth flow |
| `google-oauth.ts` | OAuth2 PKCE flow, token refresh |
| `provider.ts` (CUSTOM_LOADER `google-gemini-cli`) | URL rewrite, body transform, SSE unwrap, token refresh, project ID cache |
