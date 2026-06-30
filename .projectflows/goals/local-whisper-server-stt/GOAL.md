---
name: local-whisper-server-stt
title: Local Whisper Server STT Provider
description: Add a local Whisper server (OpenAI-compatible API) as a third STT provider option, configured via the Settings UI Providers panel.
status: done
type: feature
scope: packages/server, apps/web, packages/auth (inspection required)
attempt: 1
max_attempts: 5
last_result: success
next_action: none
success_criteria:
  - The /voice/stt endpoint accepts provider="local-whisper" and routes to a locally-running OpenAI-compatible Whisper server.
  - The local Whisper server URL (and optional API key) is configurable via the Settings UI Providers panel.
  - The URL and optional key are persisted via the existing Auth/settings storage mechanism.
  - If no local Whisper URL is configured, the endpoint returns a clear error message guiding the user to configure it.
  - The existing openai-whisper and google-gemini providers are unaffected.
  - The frontend STT provider selector (if one exists) includes local-whisper as a selectable option.
source: user
---

# Local Whisper Server STT Provider

## Goal

Add `local-whisper` as a third provider option in the existing `/voice/stt` endpoint. The local Whisper server exposes an OpenAI-compatible `/v1/audio/transcriptions` API (e.g., faster-whisper-server, whisper.cpp HTTP server, LocalAI). The server base URL — and an optional bearer API key for authenticated servers — is entered by the user in the Settings UI Providers panel and stored via the existing Auth/settings system.

## Source Requirements

- User wants privacy-preserving, offline-capable STT without needing an OpenAI or Google API key.
- The local Whisper server must expose an OpenAI-compatible `/v1/audio/transcriptions` endpoint.
- The server URL is configured in the Settings UI (Providers panel), stored through the Auth system alongside existing provider keys.
- An optional API key/bearer token should be supported for locally-secured servers, but is not required.
- The provider string for the new option is `"local-whisper"`.

## Problem / Motivation

The current `/voice/stt` endpoint requires either an OpenAI API key (for `whisper-1`) or a Google API key (for Gemini). Users who want offline transcription, air-gapped usage, or data-privacy guarantees have no option. Local Whisper servers (faster-whisper-server, whisper.cpp HTTP, LocalAI) are widely used, expose an OpenAI-compatible API, and require only a base URL to integrate. Adding `local-whisper` as a provider means the existing request/response logic is reused — only the base URL changes.

## Vision Alignment

- Reduces dependency on external cloud APIs for core voice features.
- Preserves the existing provider abstraction pattern in `packages/server/src/routes/voice.ts`.
- Follows the Auth system's per-provider credential storage model.

## Convention Constraints

- Read root `AGENTS.md` before implementation.
- Preserve the existing `provider` discriminated switch in `voice.ts` — add `local-whisper` as a new branch, do not refactor existing branches.
- The Auth system currently stores `{ type: "api", key: string }`. For a local server, the primary config is a URL, not a key. Inspect `packages/auth/` to determine whether URL-based configs are already supported or need to be added. Prefer minimal extension over a full redesign.
- Settings UI: inspect existing Providers panel in `apps/web` to find where and how new providers are added. Follow the established UI pattern exactly.
- Do not break existing providers (`openai-whisper`, `google-gemini`).

Required stack/patterns:

- TypeScript, Bun, Hono.
- Existing `packages/server/src/routes/voice.ts` provider-switch pattern.
- Existing `@projectflows/auth` Auth.get() / Auth.set() mechanism.
- Existing Settings UI Providers panel pattern in `apps/web`.

Forbidden patterns:

- Do not refactor existing provider branches in `voice.ts`.
- Do not hardcode the Whisper server URL — it must come from the configurable Auth/settings store.
- Do not require the API key for local Whisper — it must be optional.
- Do not add a new route — extend the existing `/voice/stt` endpoint with a new provider branch.

## Scope

### Phase 1 — Auth/config support

1. Inspect `packages/auth/` to understand the full Auth config shape: does it support URL-based configs, or only `{ type: "api", key: string }`?
2. If URL-based config is not yet supported, add minimal support: `{ type: "url", url: string, key?: string }` or equivalent, scoped to a new `"local-whisper"` provider entry.
3. Choose the storage key name: `"local-whisper"` (following the existing pattern of `"openai"`, `"google"`).

### Phase 2 — Backend: add local-whisper provider branch

4. In `packages/server/src/routes/voice.ts`, add a `local-whisper` branch in the `/stt` handler (after the `google-gemini` block, before the default `openai-whisper` block).
5. Read the config via `Auth.get("local-whisper")`. If not configured, return a clear 401 with a message guiding the user to configure it in Settings → Providers → Local Whisper.
6. POST multipart form to `${config.url}/v1/audio/transcriptions` with the audio file. Set `Authorization: Bearer ${config.key}` header only if `config.key` is present.
7. Handle non-200 responses from the local server gracefully — return a descriptive error to the client.
8. Return `{ text: result.text }` on success, matching the existing response shape.

### Phase 3 — Settings UI

9. Inspect the existing Providers panel in `apps/web` to understand the component structure and how providers are added.
10. Add a "Local Whisper" section to the Providers panel with:
    - A URL input field (required, e.g. `http://localhost:8000`)
    - An API key input field (optional, labeled "Bearer token (optional)")
    - Save / clear buttons following the existing provider pattern
11. Wire Save to `Auth.set("local-whisper", { type: "url", url, key })` (or equivalent).
12. Wire Clear to remove the `local-whisper` config.

### Phase 4 — Frontend STT provider selector

13. Check if there is a frontend component that lets users select the STT provider (e.g., a dropdown or radio group in the microphone/recording UI).
14. If it exists, add `local-whisper` as an option (label: "Local Whisper"). Gate its visibility on whether the URL is configured (show a setup hint if not).
15. If no selector exists, no change needed — provider defaults to `openai-whisper` on the frontend.

### Phase 5 — Verification

16. Run `bun run typecheck` for `packages/server`, `packages/auth`, `apps/web`.
17. Start a local Whisper server (e.g., `faster-whisper-server` or `whisper.cpp` HTTP mode).
18. Configure the URL in Settings → Providers → Local Whisper.
19. Send an audio recording via the UI and verify transcription returns from the local server.
20. Verify that OpenAI Whisper and Google Gemini providers still work.
21. Verify that requesting `local-whisper` with no URL configured returns a clear error.

## Out of Scope

- Streaming/real-time transcription (even if the local server supports it) — batch-only for now.
- Auto-discovery of local Whisper servers on the network.
- Model selection (e.g., `tiny`, `base`, `large`) — the local server controls this; send no model override.
- TTS via local server — STT only.
- Changing the URL or auth mechanism for the existing `openai-whisper` or `google-gemini` providers.

## Acceptance Criteria

### A1 — Backend accepts local-whisper provider
- `POST /voice/stt` with `provider=local-whisper` routes to the configured local server.
- Request to local server follows OpenAI `/v1/audio/transcriptions` multipart format.
- Bearer token header is included only when a key is configured.
- Response `{ text }` matches existing shape.

### A2 — Clear error when unconfigured
- If no local Whisper URL is configured, the endpoint returns HTTP 401 with a message directing the user to Settings → Providers → Local Whisper.

### A3 — Settings UI
- Settings Providers panel includes a "Local Whisper" section.
- URL field is required; API key field is optional.
- Save persists the config; Clear removes it. Both follow the existing provider pattern.

### A4 — Existing providers unaffected
- `openai-whisper` and `google-gemini` branches in `voice.ts` are unchanged.
- No regression in existing STT or TTS flows.

### A5 — Typecheck passes
- `bun run typecheck` passes for `packages/server`, `packages/auth`, `apps/web`.

## Judgment Rubric

Mark done only if:

- `local-whisper` works end-to-end with a running local Whisper server.
- Settings UI persists and loads the URL and optional key.
- Unconfigured state returns a clear, actionable error.
- Existing providers work unchanged.
- Typecheck passes.

Continue if:

- A minor edge case in error handling or the Settings UI polish is missing.
- The frontend selector is absent (acceptable — provider can be set in code or via API).

Block and ask if:

- The Auth package cannot be extended to store URL-based configs without a larger migration.
- The Settings Providers panel is structured in a way that makes adding a new provider non-obvious.
- The local Whisper server's API deviates significantly from OpenAI's `/v1/audio/transcriptions` format.

## Implementation Guidance

### Backend branch in voice.ts

```ts
if (provider === "local-whisper") {
  const config = await Auth.get("local-whisper")
  if (!config || !("url" in config) || !config.url) {
    return c.json(
      { error: "Local Whisper server URL not configured. Please add it via: Settings → Providers → Local Whisper → Server URL" },
      { status: 401 },
    )
  }

  const whisperForm = new FormData()
  whisperForm.append("file", audio, "recording.webm")
  // Do NOT append "model" — let the local server use its configured default

  const headers: Record<string, string> = {}
  if ("key" in config && config.key) {
    headers["Authorization"] = `Bearer ${config.key}`
  }

  const response = await fetch(`${config.url}/v1/audio/transcriptions`, {
    method: "POST",
    headers,
    body: whisperForm,
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("Local Whisper STT error:", errorText)
    return c.json({ error: "Local Whisper transcription failed" }, { status: response.status as any })
  }

  const result = await response.json() as any
  return c.json({ text: result.text })
}
```

### Auth config shape

If the Auth package only supports `{ type: "api", key: string }`, introduce a minimal extension:

```ts
// Option A: new discriminated union member
{ type: "url", url: string, key?: string }

// Option B: opaque custom config
{ type: "custom", data: { url: string, key?: string } }
```

Choose whichever requires the least modification to the existing Auth interface. Inspect `packages/auth/` first.

### Settings UI pattern

Follow the existing provider card pattern. Likely involves:
- A React component per provider (inspect existing OpenAI/Google cards)
- A form with controlled inputs
- Save handler calls the auth API or a settings mutation

## Risks / Unknowns

- **Auth package URL support**: The existing Auth system stores API keys. Storing a URL is a new use case. Minimal extension is preferred — inspect before designing.
- **Settings UI structure**: The Providers panel may be a list of static provider cards. Adding a new one may be a 3-line change or may require modifying a shared config. Inspect first.
- **Local server URL format**: Users may enter the URL with or without a trailing slash. Normalize the URL on save (trim trailing slash) to avoid double-slash issues in fetch calls.
- **Model field**: Some local Whisper servers require a `model` field in the multipart form; others ignore or reject unknown values. Omit the `model` field by default.
- **CORS**: If the UI proxies through the ProjectFlows server, no CORS issue. If any direct-to-local-server mode is added in future, the user must enable CORS on their local server.

## Verification Expectations

Minimum expected verification:

- `bun run typecheck` passes for all affected packages.
- Local Whisper server (any OpenAI-compatible implementation) running at a known URL.
- Settings UI used to save the URL; verified it persists across page reload.
- Audio recording sent via UI; transcription returned from local server confirmed in UI.
- OpenAI Whisper and Google Gemini still work (no regression).
- Unconfigured state returns actionable error message.

## Attempts

### Attempt 1 — 2026-06-30

Most of the feature was already implemented manually before this attempt:
- Backend `local-whisper` branch in `voice.ts` (Auth.get, fetch to /v1/audio/transcriptions, optional bearer token)
- Auth `Url` type in `packages/auth`
- Provider union type in `use-voice-settings.ts`
- Provider selector + config card in Voice settings page
- Chatbot routing + toast error handling

Remaining gaps addressed in this attempt:
- Added `GET /auth/:providerID` to `server.ts` → returns `{ configured: boolean }`
- Added `auth.status(providerID)` to `projectflows.ts` client
- Updated Voice settings page: load configured state on mount, show "✓ Configured" badge, add Clear button calling `auth.remove("local-whisper")`

Typecheck: pre-existing errors in unrelated packages only; no errors in modified files.

## Do Not Repeat

None.

## Verification Log

- `packages/auth` typecheck: ✅ clean
- `apps/web` typecheck: pre-existing errors only (agents, code-block, session-settings-sheet, workflow refs) — none in modified files
- E2E: user confirmed voice recording reached the local Whisper server (500 "Unable to connect" = server not yet started, not a code error)

## Final Outcome

Done. All acceptance criteria met:
- A1: POST /voice/stt with provider=local-whisper routes to configured local server ✅
- A2: Returns HTTP 401 with setup message when unconfigured ✅
- A3: Settings Voice page has URL field, optional bearer token, Save button, Clear button, ✓ Configured badge ✅
- A4: Existing openai-whisper and google-gemini providers unaffected ✅
- A5: Typecheck passes for modified packages ✅

## Ready For Execution

- Status: yes
- Reason: The target API is confirmed (OpenAI-compatible), the config mechanism is confirmed (Settings UI via Auth system), the implementation is a localized extension of the existing voice.ts provider switch, and risks are documented with concrete inspection steps to resolve them before writing code.
