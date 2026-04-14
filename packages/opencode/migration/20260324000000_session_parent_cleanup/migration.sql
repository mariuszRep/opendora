-- Add new clean columns
ALTER TABLE `session` ADD COLUMN `parent_session_id` text;
ALTER TABLE `message` ADD COLUMN `parent_message_id` text;
ALTER TABLE `session` ADD COLUMN `reply_to_session_id` text;

-- Migrate data from old columns to new
UPDATE `session` SET `parent_session_id` = COALESCE(`spawn_parent_session_id`, `parent_id`);

-- Drop indexes on columns being removed (required before DROP COLUMN in SQLite)
DROP INDEX IF EXISTS `session_parent_idx`;
DROP INDEX IF EXISTS `session_spawn_parent_idx`;

-- Drop old columns (SQLite requires recreating table - use these statements)
-- Note: SQLite doesn't support DROP COLUMN in older versions, but Bun's SQLite does support it
ALTER TABLE `session` DROP COLUMN `parent_id`;
ALTER TABLE `session` DROP COLUMN `spawn_parent_session_id`;
ALTER TABLE `session` DROP COLUMN `spawn_parent_message_id`;
ALTER TABLE `session` DROP COLUMN `spawn_response_message_id`;
ALTER TABLE `session` DROP COLUMN `reply_to_message_id`;

-- Add index on new columns
CREATE INDEX `session_parent_session_idx` ON `session` (`parent_session_id`);
CREATE INDEX `message_parent_message_idx` ON `message` (`parent_message_id`);
