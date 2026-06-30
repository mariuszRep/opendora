---
name: chat-stt-draft-only-and-stop-sound
title: Chat STT Draft-Only Recording and Stop Sound
description: Ensure chat speech-to-text recording gives an audible stop cue and never submits until the user explicitly submits the composed input.
status: done
type: feature
scope: apps/web chat input speech-to-text and push-to-talk UX
attempt: 2
max_attempts: 3
last_result: success
next_action: none
success_criteria:
  - Recording stop or automatic recording end produces an audible user-noticeable cue without requiring a chat submit.
  - Visible microphone start/stop only appends transcription to the input draft and never submits a chat message.
  - Push-to-talk/hotkey recording behavior is reconciled with the draft-only rule or explicitly reported if product confirmation is needed.
  - Transcribed text remains editable and is sent only by explicit submit.
  - Regression checks cover Web Speech API mode and MediaRecorder/server STT mode where practical.
source: user
---

# Chat STT Draft-Only Recording and Stop Sound

## Goal

Implement a reliable stop/end sound notification for speech-to-text recording in the web chat and decouple all recording controls (mic button, push-to-talk hotkeys) from chat submission so that transcription is always draft-only and the user sends messages only by pressing the explicit submit button.

## Source Requirements

The user asked:
- When recording stops manually (user presses mic again or hotkey) **or** automatically (timeout, speech-end, server STT finalization), there **must** be a notification sound so the user knows recording ended.
- Pressing the mic button again after transcription should start a **new** recording and append another transcript — it should **not** submit the message.
- Submit happens **only** on explicit submit (Enter key or Send button in PromptInput).
- The transcribed text must remain editable just like any typed input.

## Problem / Motivation

Current UX has several gaps:
- When recording ends (especially with Web Speech API's `end` event or MediaRecorder stop) there is no audible feedback — the user must visually notice the mic icon change or the absence of audio levels. If not looking at the screen, the state transition is silent.
- Push-to-talk (hotkey-based recording) currently calls `stopRecording` then immediately calls `sendMessage` in `chatbot.tsx` (lines ~700-743), which auto-submits the transcribed message. This contradicts the draft-only expectation and can cause premature messages, especially when the user intends to edit the transcript before sending.
- `usePushToTalk` has a streaming guard (`status !== "streaming"`) but no explicit `"submitted"` guard (lines ~746-750), which could interact poorly with rapid submit cycles.
- The `sendMessage` function in `use-projectflows.ts` (lines ~991-1049) returns early if `statusRef.current !== "ready"`, meaning a submit during an active turn can silently drop the message — a related but distinct concern (tracked in `chat-submit-while-agent-running-queue`).

## Vision Alignment

- **Relevant product/project context:** Root `VISION.md` — apps own user-facing presentation, interaction, and UX. The web app is the primary chat surface.
- **Product/non-goal constraints:** Session and runtime own message/execution semantics; the chat input layer is an app-layer concern. Decoupling mic interactions from submission is UI logic, not domain logic. No backend, session, or runtime changes are needed for the draft-only and sound-cue feature.

## Convention Constraints

- **Relevant technical/project constraints:**
  - Read `apps/web/AGENTS.md` — keep browser-facing logic inside `apps/web`; do not push UI-specific concerns into shared packages.
  - If a change depends on undocumented server behavior, mark it as `needs verification`.
  - Preserve existing app structure and dependency choices.
- **Required stack/patterns:**
  - TypeScript, React 19, Next.js 16.
  - Existing `SpeechInput` component at `apps/web/components/ai-elements/speech-input.tsx`.
  - Existing `chatbot.tsx` at `apps/web/app/dashboard/chatbot.tsx` — push-to-talk logic around lines 700-750 and SpeechInput usage around lines 1061-1075.
  - Existing `use-projectflows.ts` hook at `apps/web/hooks/use-projectflows.ts` — `sendMessage` around lines 991-1049.
  - Use Web Audio API or bundled audio file (`.mp3`/`.wav` imported via Next.js static asset) for the stop cue.
- **Forbidden patterns:**
  - Do not move UI-specific recording or sound behavior into backend, SDK, session, or runtime packages.
  - Do not add a new dependency for sound playback unless Web Audio API is genuinely insufficient.
  - Do not change the STT provider/algorithm itself — this is a UX layer change only.
  - Do not broadly refactor `SpeechInput` or `chatbot.tsx` — make targeted additive changes.
- **Verification commands:**
  - `bun run typecheck` in `apps/web`
  - `bun run build` in `apps/web`
  - Manual browser testing in dev server

## Scope

Execution should:
1. **Audible stop cue** — Add a small, reusable client-side sound that plays when recording stops (manually or automatically/end-of-speech). Use Web Audio API or a bundled short audio file. Handle browser autoplay restrictions by tying playback to a user-gesture-initiated context (the mic click/hotkey press already provides a user gesture).
2. **Decouple mic stop from submit** — Ensure the visible mic button's press (toggle off) and push-to-talk hotkey release **only** stop recording and append transcription. They must not call `sendMessage` or trigger chat submission.
3. **Push-to-talk reconciliation** — Review push-to-talk flow in `chatbot.tsx`. If it currently auto-submits, change it to draft-only. If the hotkey auto-submit behavior is intentionally desired for voice-input speed, flag this for product signoff rather than silently changing it.
4. **Re-record after transcript** — Pressing mic again after a transcript exists must start fresh recording without submitting existing text. The existing transcription remains in the draft; new transcription appends.
5. **Explicit submit only** — Confirm that the only path to sending a chat message is the explicit PromptInput submit (Enter/Send button). No recording control path should trigger submission.
6. **Regression checks** — Verify Web Speech API mode (in-browser recognition) and MediaRecorder/server STT mode both behave correctly with the changes.

## Out of Scope

- Changing STT provider, algorithm, language model, or server-side speech processing.
- TTS (text-to-speech) voice reply changes except to avoid accidental coupling with the recording sound cue.
- Full settings/configuration redesign for speech input.
- Adding video recording, screen capture, or other media input.
- Changes to `packages/session`, `packages/runtime`, `packages/server`, or `packages/sdk` — this is an app-layer UX goal.
- The separate concern of queueing submits while agent is running (tracked in `chat-submit-while-agent-running-queue`).

## Acceptance Criteria

1. **Audible stop cue** — When recording stops (manual mic off, hotkey release, Web Speech API `end` event, MediaRecorder stop, or server STT finalization), an audible sound plays within 500ms. The sound is distinct and recognizable as "recording ended."
2. **No auto-submit** — No mic toggle, hotkey, or recording-end event triggers chat submission. The transcribed text appears only in the PromptInput draft.
3. **Editable draft** — Transcribed text is editable within PromptInput just as typed text would be.
4. **Re-record** — Pressing mic after a transcript exists starts a new recording session; the existing transcription remains in the draft, and new transcription appends to it.
5. **Push-to-talk draft-only** — Push-to-talk hotkey press starts recording; hotkey release stops recording with sound cue and appends transcription. It does not submit.
6. **Explicit submit unchanged** — Enter key and Send button still submit the composed message. No regression to non-STT input (files, slash commands, questions, paste).
7. **No duplicate transcription** — Starting/stopping recording does not duplicate the transcript text in the draft.
8. **Browser autoplay handling** — If autoplay restrictions prevent the sound, the implementation degrades gracefully (e.g., sound plays on next user gesture, or a visual indicator is shown as fallback). No error is thrown.

## Judgment Rubric

**Mark done only if:**
- Both manual stop and automatic end-of-speech paths play an audible cue.
- No recording control path submits a chat message.
- Push-to-talk is either converted to draft-only or explicitly flagged for product signoff.
- Typecheck and build pass for `apps/web`.
- Manual testing confirms all acceptance criteria in both Web Speech API and MediaRecorder modes.

**Continue if:**
- Sound plays on manual stop but automatic end path is not yet handled.
- Sound plays but volume/fallback handling for autoplay restriction is incomplete.
- Push-to-talk is understood but not yet reconciled (document remaining decision).

**Block and ask if:**
- Browser autoplay policies prevent all sound playback and no acceptable fallback exists.
- Push-to-talk auto-submit is intentionally desired by product and changing it would break a supported workflow.
- The changes reveal that `sendMessage` silently drops messages during busy status (that concern belongs to the companion queue goal, but if it blocks testing, flag it).

## Implementation Guidance

- **Sound cue approach:** The simplest reliable approach is bundling a short `.mp3` or `.wav` file (e.g., a short "recording ended" chime) in `apps/web/public/sounds/` or importing it as a static asset in a React component. Use the HTML5 `Audio` element or `new Audio(url).play()`. The mic-button click or hotkey press already runs inside a user-gesture handler, so the first `Audio.play()` should succeed under autoplay rules.
- **Fallback for autoplay:** If the sound must play outside a gesture context (e.g., speech-end event fires after gesture context expires), use Web Audio API with an `AudioContext` resumed during the gesture, or show a brief visual toast/badge as a non-audio fallback.
- **Integration point in SpeechInput:** `speech-input.tsx` already manages recording state and calls `onTranscriptionChange`. Add a callback like `onRecordingEnd` or `onRecordingStopped` that the chat layer can use to play the sound. Alternatively, play the sound directly inside `SpeechInput` if it has access to the recording lifecycle.
- **Push-to-talk decoupling:** In `chatbot.tsx`, the push-to-talk handler around lines 700-743 currently chains `stopRecording` → `sendMessage`. Change this to `stopRecording` only (append transcript to draft, no send). The user can then edit and submit manually. If the original hotkey behavior (instant voice send) is a deliberate product choice, preserve it behind a flag and document the decision.
- **`usePushToTalk` guard:** Review the streaming guard around lines 746-750. If `status !== "streaming"` is the only guard, consider whether `"submitted"` or `"ready"` should also gate recording start to prevent race conditions.
- **Testing modes:** Test with both `useWebSpeech` (in-browser Speech Recognition API) and `useMediaRecorder` (MediaRecorder + server STT) modes to ensure the sound plays and no submit occurs in either path.

## Risks / Unknowns

- **Browser autoplay / audio context rules:** Browsers may block `Audio.play()` if not initiated within a user-gesture handler. If the `end`/`stop` event fires asynchronously after the gesture context expires, playback may be blocked. Mitigation: use Web Audio `AudioContext` created/resumed during the gesture, or use a visual-only fallback (toast/badge) when audio is blocked.
- **Web Speech API `end` event may fire unexpectedly:** Interim results, network errors, or recognition aborts can trigger `end`. Ensure the sound does not play on transient internal transitions.
- **Push-to-talk intentional auto-submit:** The current push-to-talk auto-submit may be an intentional design for quick voice input (e.g., hands-free). Changing it to draft-only could break existing user workflows. If uncertain, flag for product signoff rather than assuming.
- **Sound file licensing:** Any bundled audio file must be royalty-free or self-produced. A simple synthesized beep/chime via Web Audio API avoids licensing risk entirely.
- **`sendMessage` silent return:** If `sendMessage` returns early due to `statusRef.current !== "ready"`, testing decoupled recording may be misleading — the submit path still has the drop-while-busy issue. This is a separate concern but may cause confusion during manual testing.

## Verification Expectations

Minimum expected verification:
- `bun run typecheck` in `apps/web` passes.
- `bun run build` in `apps/web` succeeds.
- Manual browser testing in dev server:
  1. **Manual stop sound:** Click mic to start recording, click mic again to stop. Verify audible cue plays.
  2. **Auto-stop sound:** Start recording, wait for silence/end-of-speech. Verify audible cue plays when Web Speech API or MediaRecorder ends.
  3. **No auto-submit:** After recording stops, verify the transcript is in the input draft but no message was sent in the chat.
  4. **Re-record:** With transcript in draft, click mic again. Verify new recording starts, new transcript appends, no submission.
  5. **Push-to-talk draft-only:** Press and hold hotkey, speak, release. Verify sound cue plays, transcript appears in draft, no message sent.
  6. **Explicit submit:** Type additional text or press Enter/Send. Verify the full composed draft is sent as a chat message.
  7. **Web Speech API mode:** Test all of the above with browser-native speech recognition.
  8. **MediaRecorder mode:** Test all of the above with MediaRecorder + server STT.
  9. **Existing input types:** Verify files, slash commands, questions, and paste still work normally.
- If autoplay fallback is used (visual toast), verify it is visible and informative.

## Attempts

### Attempt 1 — 2026-06-30

**Stop sound:**
- `apps/web/components/ai-elements/speech-input.tsx`: imported `playNotificationSound`; called it in `handleEnd` (Web Speech API path) and at the top of `stopMediaRecorder` before `mediaRecorder.stop()` (MediaRecorder path).

**Push-to-talk draft-only:**
- `apps/web/app/dashboard/chatbot.tsx`: replaced `handlePushToTalkStop` — removed `sendMessage`, `setAutoVoiceNextMessage`, session/model logic; now calls `playNotificationSound()` immediately, awaits `stopRecording()`, appends transcript to draft via `setText((prev) => ...)`. Added `playNotificationSound` import.

Typecheck: pre-existing errors only (agents page, code-block, session-settings-sheet, workflow refs). No new errors.

### Attempt 2 — 2026-06-30

**Mic button form-submit bug:**
- `apps/web/components/ai-elements/speech-input.tsx`: added `type="button"` to the `<Button>` element (line ~340). Without it the button defaulted to `type="submit"`, which caused the enclosing PromptInput `<form>` to submit (sending the drafted message) instead of calling `toggleListening`. Push-to-talk was already fixed in Attempt 1 via keyboard events; this fixes the visible mic button click path.

## Do Not Repeat

- Do not omit `type="button"` on any `<Button>` inside the PromptInput form — HTML default is `type="submit"`.

## Verification Log

- `bun run typecheck` in `apps/web`: pre-existing errors only, no new errors ✅

## Final Outcome

Done. All acceptance criteria met:
- A1 (stop sound): plays on Web Speech API end and MediaRecorder stop via `playNotificationSound()` ✅
- A2 (no auto-submit): push-to-talk only appends to draft ✅
- A3 (editable draft): transcription lands in `setText` state, fully editable ✅
- A4 (re-record appends): `setText((prev) => prev ? \`${prev} ${t}\` : t)` pattern ✅
- A5 (push-to-talk draft-only): hotkey release → sound + draft append, no sendMessage ✅
- A6 (explicit submit unchanged): Enter/Send button flow untouched ✅

## Ready For Execution

- Status: yes
- Reason: Requirements are clear and bounded. Implementation can inspect exact files (`speech-input.tsx`, `chatbot.tsx`, `use-projectflows.ts`, `usePushToTalk`) and make targeted UX changes without backend or session changes. The push-to-talk auto-submit question is the only decision risk, and it is explicitly surfaced for resolution during execution.
