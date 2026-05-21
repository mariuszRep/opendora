---
name: product-architecture
description: "Use with requirements when product-level architecture decisions need structured discovery: ensure constraints, interfaces, NFRs, risks, and rollout decisions are complete before planning/implementation."
origin: opendora
---

# Product Architecture

Use this skill as a product-focused architecture companion to `requirements`.

## When to Use
- Requirements were gathered but architecture-critical decisions are still ambiguous.
- Product Owner needs confidence that implementation planning will not miss key system constraints.
- Delivery risk is medium/high due to scale, integration, compliance, or migration complexity.

## Objective
- Ensure architecture decisions are complete, explicit, and implementation-ready.
- Surface missing decisions early to prevent costly rework.

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

## Steps
1. Review available requirements and context evidence.
2. Evaluate each checklist area and mark: Covered | Partial | Missing.
3. Ask targeted architecture questions only for Partial/Missing areas.
4. Consolidate decisions into explicit architecture notes.
5. Produce readiness verdict for `product-plan`.

## Rules
- Do not jump to implementation details unless needed to resolve architecture risk.
- Prefer explicit decision records over narrative text.
- If critical architecture gaps remain, block planning and state exactly why.

## Output Contract
- Architecture Decision Summary
- Coverage Matrix (Covered/Partial/Missing per checklist area)
- Open Questions (owner + impact)
- Risks and Mitigations
- Readiness for `product-plan`: READY | BLOCKED