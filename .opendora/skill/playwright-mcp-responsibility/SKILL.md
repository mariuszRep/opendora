---
name: playwright-mcp-responsibility
description: Use whenever an agent has Playwright MCP/browser automation access or plans to open, navigate, click, type, screenshot, scrape, test, or debug a website through a browser. This skill helps agents use Playwright MCP safely, minimally, and transparently, especially around login, forms, side effects, external websites, user data, screenshots, and repeated automation.
origin: opendora
---

# Playwright MCP Responsibility

Use this skill when you are using browser automation through Playwright MCP or deciding whether to use it. The goal is to get the user the needed result without surprising them, changing external state unintentionally, leaking sensitive data, or wasting session time on brittle browsing loops.

## Variables

- `{{user_goal}}` - what the user wants from browser automation: inspect, test, reproduce, fill, scrape, debug, monitor, or interact.
- `{{target_site}}` - the URL, app, localhost route, or site name involved.
- `{{side_effect_risk}}` - whether actions could submit data, purchase, publish, delete, message, change settings, or affect another account/system.
- `{{auth_state}}` - whether the task needs login, cookies, tokens, SSO, user credentials, or a private session.

## Objective

- Use Playwright MCP only when a live browser adds value beyond reading code, docs, logs, or static content.
- Keep browser actions scoped to the user's goal and stop before risky or irreversible actions unless explicitly approved.
- Preserve privacy by minimizing captured, copied, and reported sensitive data.
- Produce a concise, reproducible report of what was observed and what was changed, if anything.

## Before Opening The Browser

1. Identify why browser automation is needed. Prefer code inspection, existing tests, API calls, logs, or static docs when those answer the question with less external impact.
2. Classify the target:
   - `local/dev` - localhost, preview deployments, test accounts, staging, or user-owned apps.
   - `external/public` - public websites where browsing is read-only.
   - `external/private` - logged-in accounts, admin consoles, production SaaS, banking, health, government, email, social, or anything with private user data.
3. Classify the action:
   - `observe` - navigate, inspect layout, read visible text, capture screenshots.
   - `test` - exercise app flows in a safe environment with known test data.
   - `input` - type into fields, upload files, or change filters/settings.
   - `commit` - submit, save, publish, buy, send, delete, invite, approve, or trigger workflow effects.
4. If the task involves `external/private` or `commit`, ask one targeted question before proceeding unless the user has already given explicit instructions for the exact action.
5. State your intended browser scope briefly when it matters: target, environment, and where you will stop.

## Responsible Browser Workflow

1. Start narrow: open only the target page or route needed for `{{user_goal}}`.
2. Observe before acting. Use page text, accessibility snapshots, visible state, console/network signals, or screenshots to understand the page before clicking.
3. Prefer stable selectors and user-visible affordances over coordinate clicks. If using a screenshot, describe the visible target you are selecting.
4. Keep interactions reversible until approval is clear. For forms, fill test data only in local/staging/test accounts unless the user asked for real account actions.
5. Pause before final submission or irreversible actions. Ask the user if the exact final action was not already authorized.
6. Avoid loops. If a page blocks automation, requires CAPTCHA/MFA, has broken selectors, or keeps redirecting, stop and report the blocker instead of repeatedly retrying.
7. Clean up when feasible: close extra pages, undo temporary local/test data changes, and note any state left behind.

## Authentication And Secrets

- Do not ask the user to paste passwords, one-time codes, recovery codes, API keys, session cookies, or bearer tokens into the chat.
- If login is required, prefer user-driven login in the browser window, existing safe auth state, test credentials explicitly provided for automation, or a local/staging bypass intended for development.
- Treat screenshots, page text, console logs, network payloads, cookies, local storage, and DOM content as potentially sensitive.
- Do not expose secrets in the final report. Redact values and quote only the minimum text needed to support the finding.
- Stop and ask before navigating authenticated production accounts, admin pages, billing pages, inboxes, medical/legal/financial records, or private third-party data.

## External Impact Boundaries

Ask before actions that could:

- submit, publish, message, email, invite, purchase, book, cancel, approve, reject, merge, deploy, delete, or change permissions;
- create load, scrape at scale, bypass rate limits, or violate a site's terms;
- access data from accounts or organizations the user has not clearly authorized;
- upload, download, or retain files that may contain personal, confidential, or regulated data.

When approval is needed, ask a single concrete question such as: `I can fill this form, but submitting it will email real customers. Should I stop at the preview screen or send it now?` Recommend the safer default first.

## Testing And Debugging Web Apps

- Prefer local, preview, staging, or dedicated test accounts for flows with writes.
- Use deterministic test data with obvious markers like `test-automation` when creating records is necessary.
- Capture enough evidence to reproduce: URL or route, viewport if relevant, key steps, expected behavior, actual behavior, console errors, failed requests, and screenshots only when they clarify the issue.
- If the browser finding points to code, switch back to code inspection rather than continuing to click around.
- For visual checks, mention browser size and any responsive breakpoint assumptions.

## Scraping And Data Collection

- Keep collection minimal and purpose-bound. Do not crawl broadly when the user asked for one page or a small sample.
- Respect login walls, paywalls, robots/terms signals, rate limits, and personal data boundaries.
- Prefer official APIs, exports, or documented feeds when available.
- Summarize findings instead of copying large amounts of site content unless the user needs exact text and it is appropriate to retain.

## Reporting

In the final answer, include only what is useful:

- Browser scope: target site/app and environment visited.
- Actions taken: notable navigation, inputs, clicks, tests, or screenshots.
- Findings: what was observed, reproduced, or verified.
- State changes: explicitly say `no state-changing actions taken` or list what changed.
- Blockers: auth, CAPTCHA, missing approval, inaccessible page, or unreliable automation.

## Stop Conditions

Stop browser automation and report instead of pushing through when:

- the next step is a real-world commit without explicit approval;
- credentials, MFA, CAPTCHA, or private auth material is required from chat;
- the site appears to prohibit or block automation;
- actions could affect third parties, billing, production data, or regulated/private records;
- repeated tool failures suggest the browser state is unreliable.
