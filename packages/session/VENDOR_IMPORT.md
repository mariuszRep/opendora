# Vendor session import

Short summary of the vendor-import work landed in this package.

## What this feature does

Read a conversation produced by another agent (Claude Code or Codex today) and
materialise it as a native opendora session, with MessageV2 messages and parts,
keeping the original vendor records preserved verbatim for lossless round-trip.

```
Claude .jsonl ─┐
               ├──► opendora (session + message + part tables)
Codex  .jsonl ─┘
```

Export in the other direction is **not** implemented yet.

## Schema additions

See `src/session.sql.ts`.

- `session.vendor` — `"claude" | "codex" | "antigravity" | "windsurf"` or NULL.
- `session.native_id` — the vendor's session id.
- `session.vendor_raw_header` — JSON blob with the vendor header plus every
  non-message record from the source file.
- `message.native_id` / `message.vendor_raw` — per-message origin + raw source record.
- `part.native_id` / `part.vendor_raw` — per-part origin + raw source fragment.
- Indexes: `session_vendor_native_idx`, `message_native_idx`, `part_native_idx`.

Migration: `packages/opencode/migration/20260424120000_vendor_import/`.

## Public API

`@opendora/session/import`:

```ts
import { importClaudeSession, importCodexSession } from "@opendora/session/import"

await importClaudeSession({ projectID, sourcePath })
await importCodexSession({ projectID, sourcePath })
```

Both return `ImportResult { vendor, sessionID, nativeID, messagesImported,
partsImported, recordsSkipped, warnings[] }`.

## Importer coverage

### Claude Code (`src/import/claude.ts`)

- user + assistant messages
- text, thinking (preserves `signature` in reasoning metadata), redacted_thinking,
  tool_use, tool_result, image content blocks
- tool_use + tool_result merged into a single opendora `ToolPart` (completed state)
- `ai-title` records feed `session.title`
- every non-message line preserved in `vendor_raw_header.auxiliary`

### Codex (`src/import/codex.ts`)

- session_meta → header (id, cwd, base_instructions, model, effort)
- turn_context per-turn model/effort snapshots
- response_item: message (user / developer / assistant), reasoning (preserves
  `encrypted_content`), function_call + function_call_output,
  custom_tool_call + custom_tool_call_output
- consecutive assistant-producing records merged into one Assistant message
- call + output matched by `call_id` into a single `ToolPart`
- `thread_name_updated` event feeds `session.title`

## Verification

End-to-end smoke test at `scripts/import-smoke.ts`:

```bash
bun packages/session/scripts/import-smoke.ts
```

Creates an in-memory sqlite, applies every opencode migration, seeds a project,
feeds synthetic Claude and Codex fixtures through the importers, and asserts
that the resulting rows have correct vendor / native_id / role / part types /
tool state.

## Outstanding work

Ordered by what blocks the "cross-vendor migration hub" goal.

### Blocks cross-vendor migration

1. **Exporter: opendora → Claude `.jsonl`.** Not started. For Claude-origin
   sessions this is mostly re-emitting `vendor_raw`. For Codex-origin or
   native opendora sessions this is a real synthesis (uuids, parent chains,
   tool_use/tool_result split, thinking signatures).
2. **Exporter: opendora → Codex `.jsonl`.** Same shape as above: trivial for
   Codex-origin sessions, real synthesis otherwise (session_meta, turn_context,
   response_item ordering, `call_id` matching).
3. **Round-trip test.** Import → export → re-import → diff. Required to
   validate that either direction is actually lossless. Does not exist until
   exporters exist.
4. **CLI command.** `opendora session import <path>` and `opendora session
   export <id> --vendor claude|codex`. Today the feature is a TS function
   only, not reachable from the shell.

### Blocks complete vendor coverage

5. **Antigravity importer.** Format is encrypted protobuf; needs the decrypt
   path built first.
6. **Windsurf importer.** Same: encrypted protobuf, needs decrypt.

### Fidelity / correctness

7. **Developer role in `MessageV2.Info`.** Codex `developer` messages are
   currently folded into `User` with `system` set. A third discriminant is
   more faithful but touches every exhaustive switch in the codebase.
8. **Byte-level round-trip.** `vendor_raw` stores parsed JSON, not original
   bytes. For true byte-perfect archival add a `raw_bytes BLOB` column on
   `session` (or a side blob store) and teach exporters to prefer it.
9. **`mapPingPongPart` in `opendora-storage-adapter.ts`.** Pre-existing bug —
   writes schema-invalid `tool` parts. Importers bypass it, but it will bite
   anything that still uses the v1 `StorageAdapter.appendMessage` path.

### Housekeeping from the earlier audit

10. **v1 dead code.** `JsonlAdapter`, `SqliteAdapter`, `PostgresAdapter`, the
    v1 `storage/drizzle/schema.ts`, and the v1 `Message` type are not used by
    the real runtime. Either wire them in or delete.
11. **Docs refresh.** `STATE.md` and `AGENTS.md` describe only the v1 model.
    Neither mentions `MessageV2`, `session.sql.ts`, `OpenDoraStorageAdapter`,
    or this import module.
12. **`ROADMAP.md`.** "Add session export formats" entry should be updated to
    reflect that import has landed and export is the next concrete task.
