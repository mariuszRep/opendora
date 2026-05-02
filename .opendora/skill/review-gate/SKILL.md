---
name: review-gate
description: Load when completed work needs a quality and correctness gate. Runs builds, tests, and adversarial checks. Produces a PASS, FAIL, or PARTIAL verdict with command evidence.
---

# Review Gate

Use this skill when implementation is complete and you need to verify it is ready to hand back.

## Objective

- Prove the code works — not confirm it looks correct.
- Run builds, tests, and adversarial probes against the actual running system.
- Produce a verdict backed by command output, not reading.

## WARNING: Reading code is not verification

You will feel the urge to read the implementation and declare it correct. Resist it. These excuses mean you have not verified:

- "The code looks correct based on my reading" — run it.
- "The tests pass" — try to break it beyond the happy path.
- "This is probably fine" — not verified. Run it.
- "Let me check the implementation first" — start the server or run the command, not the file.

If you are writing an explanation instead of a command, stop and run the command.

## Baseline Steps (always run)

1. Read any `AGENTS.md`, `README.md`, `package.json`, or `Makefile` for build and test commands.
2. Run the build. A broken build is an automatic FAIL.
3. Run the test suite. Failing tests are an automatic FAIL.
4. Run typecheck and linter if configured (`bun typecheck`, `eslint`, `tsc`, `mypy`).
5. Check for regressions in related code touched by the change.

Then apply the type-specific strategy below.

## Type-Specific Strategies

**Backend/API changes** — start server → curl/fetch endpoints → verify response shapes, not just status codes → test error paths and edge inputs.

**Frontend changes** — start dev server → navigate the affected pages → check console for errors → verify state persists on refresh → test that buttons and forms actually work, not just render.

**CLI/script changes** — run with representative inputs → verify stdout/stderr/exit codes → test edge inputs: empty, malformed, boundary values.

**Bug fixes** — reproduce the original bug first → verify the fix resolves it → check related code for side effects.

**Refactoring** — existing test suite must pass unchanged → diff the public API surface (no new/removed exports) → verify same inputs produce same outputs.

**Other change types** — (a) figure out how to exercise the change directly, (b) check outputs against expectations, (c) try to break it with inputs the implementer did not test.

## Adversarial Probes (required before PASS)

Your report must include at least one adversarial probe and its result. "Tests pass" is not a probe.

Choose the probes that fit the change:
- **Boundary values** — 0, -1, empty string, very long input, unicode, MAX_INT
- **Idempotency** — same mutating request twice: duplicate created? error? correct no-op?
- **Error paths** — delete/reference IDs that do not exist, missing required fields, invalid types
- **Concurrency** — parallel requests to create-or-update paths (for servers and APIs)

## Before Issuing FAIL

Check you have not missed why the issue is actually fine:
- Is there defensive handling elsewhere that catches this?
- Is it explicitly intentional (documented, comments, commit message)?
- Is it a real limitation but unfixable without breaking external contracts? If so, note it as an observation, not a FAIL.

## Evidence Format

Every check must follow this structure. A check without a command run is a skip, not a PASS.

```
### Check: [what you are verifying]
**Command run:** [exact command]
**Output observed:** [actual output — copy-paste, truncate if very long]
**Result: PASS** (or FAIL — with Expected vs Actual)
```

## Verdict

End with exactly one of:

```
VERDICT: PASS
VERDICT: FAIL
VERDICT: PARTIAL
```

- **PASS** — all baseline checks passed and at least one adversarial probe confirmed no issues.
- **FAIL** — a baseline check failed or a probe revealed a real defect. Include what failed, exact output, and reproduction steps.
- **PARTIAL** — environmental limitation prevented a check (missing tool, server cannot start). State what was verified, what was not, and why.