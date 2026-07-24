-- Repairs `seq_in_parent` on "contains" edges and adds a uniqueness backstop.
--
-- writeContainsEdge() (packages/session/src/graph-writes.ts) previously assigned
-- seq_in_parent via a non-atomic count-then-insert with no unique constraint, so
-- concurrent writers (different connections/processes touching the same DB — e.g.
-- a nested workflow's child session) could produce two "contains" edges sharing the
-- same seq_in_parent for one parent. Since edge target ids (to_id) are generated via
-- Identifier.ascending("part")/("edge") — a lexicographically time-sortable id — they
-- reliably reconstruct true creation order even where seq_in_parent is wrong, so this
-- unconditionally renumbers every parent's children by to_id ascending. This is a
-- no-op in content for parents that were never affected (to_id order already matches
-- the original seq_in_parent order in the non-racing case).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY from_type, from_id, type ORDER BY to_id ASC) - 1 AS new_seq
  FROM edges
  WHERE type = 'contains'
)
UPDATE edges
SET seq_in_parent = (SELECT new_seq FROM ranked WHERE ranked.id = edges.id)
WHERE type = 'contains' AND id IN (SELECT id FROM ranked);
--> statement-breakpoint

-- Must run after the repair above — creating this over pre-existing duplicates
-- would abort the migration.
CREATE UNIQUE INDEX IF NOT EXISTS edges_contains_seq_unique ON edges(from_type, from_id, type, seq_in_parent) WHERE type = 'contains';
