-- PingPong session model integration
-- Adds session ownership, lifecycle status, retention, and token accounting

ALTER TABLE `session` ADD COLUMN `session_type` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `session_status` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `agent_id` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `owner_id` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `owner_kind` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `allowed_agents` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `send_policy` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `retention` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `spawn_depth` integer;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `spawn_parent_session_id` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `spawn_parent_message_id` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `input_tokens` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `output_tokens` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `cache_read_tokens` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `cache_write_tokens` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `compaction_count` integer DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `session_type_idx` ON `session` (`session_type`);
--> statement-breakpoint
CREATE INDEX `session_agent_idx` ON `session` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `session_owner_idx` ON `session` (`owner_id`);
--> statement-breakpoint
CREATE INDEX `session_spawn_parent_idx` ON `session` (`spawn_parent_session_id`);
