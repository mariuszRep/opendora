# LOG — Agent: web-researcher

---

### 2026-05-26 14:42:25 UTC [ADVISORY]

429 rate limit cascade on websearch: steps 4,7,9 all hit Exa free MCP rate limit in the same parallel batch. 3/6 websearch calls failed. Add retry-with-backoff or stagger queries to avoid data loss. est. 3 wasted calls / ~1500 tokens per run

_Context: ses_1a1da23e7ffe33kC48Pije631l_

---
### 2026-05-26 14:42:27 UTC [ADVISORY]

Wrong URL fetches on webfetch: steps 18 (about.fb.com wrong tag path, 404), 23 (meta.com/blog 400), 24 (x.ai/blog 403), 30 (anthropic.com/news/rss 404). Agent guessing paths instead of using known-good URLs. Maintain canonical URL table in ai-news-digest skill metadata. est. 4 wasted calls / ~2000 tokens per run

_Context: ses_1a1da23e7ffe33kC48Pije631l_

---
### 2026-05-26 14:42:28 UTC [ADVISORY]

Reasoning bloat: 23/45 steps (51%) are reasoning blocks. 12 consecutive reasoning steps (31-42) before a single assistant_text output. For routine data-collection tasks, compress reasoning to 2-3 steps between tool batches. est. 10+ wasted reasoning steps / ~5000 tokens per run

_Context: ses_1a1da23e7ffe33kC48Pije631l_

---
