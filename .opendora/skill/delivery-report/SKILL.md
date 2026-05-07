---
name: delivery-report
description: Load at the end of Product Engineer delivery to assemble a concise evidence-backed report from phase outputs, session refs, changed files, and verification verdict.
origin: opendora
---

# Delivery Report

Use this skill after implementation and verification, or when handing back a blocked/partial delivery.

## Objective

- Produce a concise final report with real evidence.
- Preserve session references for auditability without dumping noisy transcripts.
- State what changed, what was verified, and what remains.

## Inputs

- Intake contract
- Implementation spec
- Implementation result
- Verification verdict and evidence
- Session ids for isolated phases
- User-facing constraints or next steps

## Steps

1. Include only durable facts: changed files, behavior, commands, verdicts, blockers, and session ids.
2. Do not include raw logs unless the user asked or the failure requires reproduction detail.
3. State verification as PASS, FAIL, or PARTIAL with command evidence.
4. If checks were skipped or unavailable, explain why and mark PARTIAL when proof is incomplete.
5. Offer only natural next steps such as tests, commit, deploy, or follow-up fixes.

## Output Contract

```text
## Delivery Report

What Changed: ...
Files Changed: ...
Skills Used: ...
Sessions Used: ...
Verification: PASS | FAIL | PARTIAL - evidence
Adversarial Probe: ...
Risks/Remaining Work: ...
Status: COMPLETE | BLOCKED | PARTIAL
```

## Rules

- Never fabricate implementation or verification claims.
- Do not say "all good" without evidence.
- Keep the report concise and self-contained.
- Use file paths as standalone inline-code references when mentioning files.
- If verification claims PASS, include the adversarial or edge probe evidence from `review-gate`.
