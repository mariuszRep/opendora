-- Track the first response message produced in a spawned session
-- Enables the UI to link directly to that message and show the delegation border

ALTER TABLE `session` ADD COLUMN `spawn_response_message_id` text;
