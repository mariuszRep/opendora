---
name: ai-news-digest
description: Load when you need a high-recall, source-accurate digest of the latest AI news with explicit time-window confidence.
---

# AI News Digest

Use this skill when producing a digest of the latest AI news, especially when missing important items would be costly.

## Variables

- `{{time_window}}` - the intended freshness window, usually `last 24 hours`
- `{{watchlist}}` - optional set of entities, aliases, products, or source domains that must be checked every run
- `{{output_format}}` - optional final structure for the digest

---

## Objective

- Maximize recall first, then improve precision through focused verification
- Avoid missing important entities by combining open discovery with forced watchlist coverage
- Preserve source accuracy by grounding key claims in the strongest available sources
- Preserve time-window confidence by separating event timing from publication timing

## Steps

1. Define the working window
- Translate the request into an explicit time boundary using the current date and time.
- If no window is provided, default to `last 24 hours`.

2. Run a broad discovery pass
- Search broadly for AI news across multiple query families: general AI terms, launches, releases, funding, acquisitions, partnerships, regulation, research, benchmarks, and outages.
- Search broad discovery sources and likely primary-source surfaces such as official company pages, documentation, repositories, model hubs, research servers, and regulator sites.
- Collect candidate items without filtering aggressively.

3. Apply a coverage backstop
- For every entity or alias in the watchlist, run at least one focused freshness query inside the same window even if the broad pass found nothing.
- Treat aliases, product names, model names, and common alternate spellings as separate retrieval hooks.
- Promote recurring unknown names seen across multiple broad-pass results into temporary follow-up candidates.

4. Build candidate event records
- Normalize results into candidate events rather than article records.
- For each candidate, capture: entity, topic, claimed event, source URL, source type, publish time if visible, and why it might matter.
- Deduplicate by event, not by URL.

5. Run focused verification for each candidate
- Search the exact entity, aliases, product names, and likely primary domains.
- Prefer source strength in this order: official announcement or documentation, repository or release artifact, filing or regulator source, then reputable secondary reporting.
- Confirm what happened, whether it is actually new, and why it matters.

6. Evaluate freshness and confidence
- Track three separate fields when possible: `event_time`, `primary_publish_time`, and `discovery_time`.
- Assign `window_confidence`:
  - `high` when a trustworthy primary timestamp falls inside the window
  - `medium` when only secondary timestamps fall inside the window
  - `low` when timing is ambiguous or appears recycled
- Assign `source_confidence`:
  - `high` when key claims are supported by a primary source
  - `medium` when supported only by reputable secondary coverage
  - `low` when support is weak or conflicting

7. Score significance
- Evaluate each verified event on technical importance, market impact, user impact, regulatory significance, and novelty.
- Keep lower-confidence but potentially important items visible in a separate bucket rather than dropping them silently.

8. Produce the digest
- Group output into:
  - `Confirmed and important`
  - `Confirmed but lower impact`
  - `Uncertain or needs follow-up`
- For each item include: headline, one-line significance, primary source, supporting sources, timestamp basis, and confidence.

## Rules

- Optimize for recall in the first pass and verification in the second pass.
- Never let a secondary article define the core claim if a primary source exists.
- Separate `reported`, `confirmed`, and `inferred` facts.
- Do not present a recycled story as new merely because a fresh article was published.
- If a likely-important item lacks a primary source, keep it with downgraded confidence instead of discarding it.
- Every missed item should lead to at least one workflow improvement: a new watchlist entry, alias, source domain, or query pattern.

## Output Shape

For each final item, provide:
- `headline`
- `what_happened`
- `why_it_matters`
- `primary_source`
- `supporting_sources`
- `timestamp_basis`
- `window_confidence`
- `source_confidence`
- `significance`
