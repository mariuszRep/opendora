ALTER TABLE `schedule` ADD COLUMN `workflow_id` text;
ALTER TABLE `schedule` ADD COLUMN `workflow_input` text;
ALTER TABLE `schedule` RENAME COLUMN `prompt` TO `description`;
ALTER TABLE `schedule` DROP COLUMN `action_type`;
ALTER TABLE `schedule` DROP COLUMN `tool_name`;
