---
name: product-architecture
description: "Use with requirements when product-level architecture decisions need structured discovery: ensure constraints, interfaces, NFRs, risks, and rollout decisions are complete before planning/implementation."
origin: opendora
---

# Product Architecture

Use this skill as a product-focused architecture companion to `requirements`.

## Relationship to `requirements`

This skill complements `requirements`; it does not replace it.

- `requirements` defines the universal elicitation method (how to ask, confirm, and de-risk).
- `product-architecture` defines product/software architecture completeness (what product-specific decisions must be captured).
- Use both together for product work: keep the requirements loop active while expanding architecture coverage.

## When to Use
- Requirements were gathered but architecture-critical decisions are still ambiguous.
- Product Owner needs confidence that implementation planning will not miss key system constraints.
- Delivery risk is medium/high due to scale, integration, compliance, or migration complexity.

## Objective
- Ensure architecture decisions are complete, explicit, and implementation-ready.
- Surface missing decisions early to prevent costly rework.
- Ensure handoff to delivery has architecture-grade completeness.

## Inputs
- Problem statement and desired product outcomes
- Existing requirements artifacts
- Current system context (if existing product)
- Constraints (time, team, budget, compliance, tech stack)

## Architecture Coverage Checklist
1. **Scope Boundaries**
   - In-scope vs out-of-scope
   - System boundaries and ownership
2. **Domain & Data**
   - Core entities and lifecycle
   - Data integrity rules, retention, privacy, residency
3. **Interfaces & Contracts**
   - API/interface shapes
   - Versioning and backward compatibility expectations
4. **Non-Functional Requirements**
   - Performance/SLOs, reliability targets, availability
   - Security, authN/authZ, auditability
   - Compliance/legal constraints
5. **Failure Modes & Resilience**
   - Error handling, retries, timeouts, idempotency
   - Degradation strategy and fallback behavior
6. **Observability & Operations**
   - Logs, metrics, tracing
   - Alerting and operational ownership
7. **Delivery & Rollout**
   - Migration/backfill strategy
   - Feature flags, phased rollout, rollback plan
8. **Cost & Capacity**
   - Expected load and growth assumptions
   - Cost-sensitive hotspots and limits
9. **Risks & Unknowns**
   - Open decisions and decision owners
   - Validation plan for highest-risk assumptions

## Delivery Complexity Assessment
Classify delivery size after architecture coverage is evaluated:

- **easy**: single domain change, low integration risk, no material schema/interface redesign, fits single-session delivery
- **medium**: multi-domain change (e.g., frontend+backend or backend+data), shared contracts needed, benefits from isolated delivery tracks
- **hard**: multi-phase delivery, high uncertainty/risk, broad architecture impact, or substantial migration/rollout complexity

## Delivery Brief (for Product Engineer handoff)
Produce one handoff brief that downstream planning must treat as the governing contract:

- **Goal**
- **Classification**: easy | medium | hard
- **Outcome / Acceptance Criteria**
- **Scope Boundaries**: in-scope / out-of-scope
- **Shared Contracts**: data model, interface/API expectations, key UI surfaces
- **NFR/Constraints**: reliability, performance, security/compliance, cost/capacity
- **Risks & Unknowns**: include owner and impact
- **Recommended Delivery Shape**: single-session | split tracks | phased

## Steps
1. Review available requirements and context evidence.
2. Continue requirements-style clarification while evaluating architecture checklist coverage.
3. Evaluate each checklist area and mark: Covered | Partial | Missing.
4. Ask targeted architecture questions only for Partial/Missing areas.
5. Consolidate decisions into explicit architecture notes.
6. Produce readiness verdict for `product-plan` and delivery handoff.

## Rules
- Do not jump to implementation details unless needed to resolve architecture risk.
- Prefer explicit decision records over narrative text.
- If critical architecture gaps remain, block planning and state exactly why.
- Maintain consistency with already-confirmed requirements unless user explicitly changes intent.

## Output Contract
- Architecture Decision Summary
- Coverage Matrix (Covered/Partial/Missing per checklist area)
- Delivery Complexity Classification: easy | medium | hard
- Delivery Brief for Product Engineer handoff
- Open Questions (owner + impact)
- Risks and Mitigations
- Readiness for `product-plan`: READY | BLOCKED
