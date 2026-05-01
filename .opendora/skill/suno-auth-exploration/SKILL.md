---
name: suno-auth-exploration
description: Use when the task is to operate Suno in an authenticated browser session to locate and download tracks; verify auth first, continue if authenticated, and stop/wait only when unauthenticated.
origin: opendora
---

# Suno Auth Exploration

Use this skill for Suno workflows where the outcome is finding and downloading tracks from a browser session.

## Variables

- `{{target_url}}` - Suno URL to open, default `https://suno.com/`
- `{{goal}}` - which tracks to download
- `{{download_scope}}` - single track, selected set, or full page/list scope

## Objective

- Verify whether the browser session is already authenticated.
- If authenticated, continue immediately with the download workflow.
- If unauthenticated, stop and wait for user login confirmation.
- Download requested tracks and report outcomes/blockers clearly.

## Steps

1. Navigate to Suno with `playwright_browser_navigate`, then capture `playwright_browser_snapshot`.
2. Confirm auth state from visible signals (account avatar/menu, library access, authenticated navigation, no login gate).
3. If authenticated, continue directly to track selection and download.
4. If unauthenticated, stop automation and ask the user to log in in the opened browser; resume only after user confirmation.
5. Re-check auth after confirmation using a fresh snapshot. If still unauthenticated, stop and report blocker.
6. Locate requested tracks using snapshot refs and targeted interactions (`click`, `type`, `press_key`, `hover`, `select_option`).
7. Open per-track action menus and execute download actions.
8. Use `playwright_browser_wait_for` for download confirmation states where available, and capture evidence via snapshot/screenshot.
9. Summarize auth path taken, tracks requested, tracks downloaded, and unresolved blockers.

## Rules

- Never request passwords, OTP codes, tokens, or cookies in chat.
- Do not attempt downloads until authenticated state is confirmed.
- If unauthenticated, ask one clear instruction to log in, then wait.
- Always snapshot before interactions; prefer snapshot refs over guessed selectors.
- Prefer targeted waits (`text`, `url`, `textGone`) over fixed sleeps.
- If CAPTCHA/MFA/redirect loops block progress, stop and report exact blocker.
