# STATE.md

## Current package behavior

- The package exports utility modules from `src/*.ts`.
- Current source files include helpers for paths, binaries, errors, retries, encoding, laziness, arrays, identifiers, and related low-level concerns.
- `package.json` marks the package as private and includes a `typecheck` script.

## Needs verification or unknown

- Which utility modules are currently consumed by which packages needs verification.
- Whether all exported utilities are intended to remain stable is unknown.
