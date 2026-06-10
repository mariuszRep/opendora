ALTER TABLE `schedule` ADD COLUMN `action_type` text NOT NULL DEFAULT 'message';
ALTER TABLE `schedule` ADD COLUMN `tool_name` text;
