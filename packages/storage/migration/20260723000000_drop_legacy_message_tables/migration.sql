-- Legacy message/part/entry_edge tables are fully superseded by the universal
-- entries+edges model (see 20260628000000_universal_entries_edges). All read
-- and write paths were cut over first (session-graph-ledger-cutover-and-legacy-removal
-- goal); this drop is the final step. SQLite drops each table's indexes
-- automatically along with the table.

DROP TABLE IF EXISTS `message`;
--> statement-breakpoint
DROP TABLE IF EXISTS `part`;
--> statement-breakpoint
DROP TABLE IF EXISTS `entry_edge`;
