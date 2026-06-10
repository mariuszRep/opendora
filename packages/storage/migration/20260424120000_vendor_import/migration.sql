-- Vendor import support
-- Adds origin columns so opendora can store conversations imported from
-- Claude Code, Codex, Antigravity and Windsurf losslessly.
ALTER TABLE `session` ADD COLUMN `vendor` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `native_id` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `vendor_raw_header` text;
--> statement-breakpoint
ALTER TABLE `message` ADD COLUMN `native_id` text;
--> statement-breakpoint
ALTER TABLE `message` ADD COLUMN `vendor_raw` text;
--> statement-breakpoint
ALTER TABLE `part` ADD COLUMN `native_id` text;
--> statement-breakpoint
ALTER TABLE `part` ADD COLUMN `vendor_raw` text;
--> statement-breakpoint
CREATE INDEX `session_vendor_native_idx` ON `session` (`vendor`, `native_id`);
--> statement-breakpoint
CREATE INDEX `message_native_idx` ON `message` (`native_id`);
--> statement-breakpoint
CREATE INDEX `part_native_idx` ON `part` (`native_id`);
