ALTER TABLE `schedule` ADD COLUMN `workflow_id` text;
--> statement-breakpoint
ALTER TABLE `schedule` ADD COLUMN `workflow_input` text;
--> statement-breakpoint
ALTER TABLE `schedule` RENAME COLUMN `prompt` TO `description`;
--> statement-breakpoint
ALTER TABLE `schedule` DROP COLUMN `action_type`;
--> statement-breakpoint
ALTER TABLE `schedule` DROP COLUMN `tool_name`;
