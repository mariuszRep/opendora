# ROADMAP.md

## Current planned work carried forward from prior backlog

- Add dedicated Postgres adapter test coverage once CI test database support exists.
- Consider enriching `sendPolicy` beyond the current flat allow/deny model.
- Add tool wrappers around `SessionManager` methods for LLM-callable session management.
- Add message deletion support.
- Add session forking support after deletion mechanics exist.
- Add cross-session thread and graph querying.
- Add session export formats.
- Add store-level maintenance controls to the retention daemon.
- Add daemon error events.
- Consider an IndexedDB storage adapter for browser environments.
- Consider a Redis-backed caching layer for multi-process deployments.

## Open design questions

- Scratchpad ownership and visibility rules are still open.

## Non-authoritative references

- `SCRATCHPAD.md` remains exploratory and is not planned work unless items are promoted into this file.
