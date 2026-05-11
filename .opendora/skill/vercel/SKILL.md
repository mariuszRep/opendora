---
name: vercel
description: Use when preparing, validating, or troubleshooting deployments and environment behavior on Vercel.
origin: opendora
---

# Vercel

Use this skill when tasks involve Vercel deployment behavior or environment configuration concerns.

## Scope
- Build/deploy configuration checks
- Environment variable and runtime expectations
- Route/output behavior relevant to Vercel hosting

## Workflow
1. Identify deployment-impacting files and settings.
2. Validate assumptions against current project configuration.
3. Apply minimal deploy-safe adjustments.
4. Report expected deployment impact and verification notes.

## Rules
- Do not assume secrets or account-level settings.
- Prefer explicit configuration over implicit defaults when risk exists.
- Surface production-impact risks clearly.