-- Add model column to session table for model override support
ALTER TABLE `session` ADD COLUMN `model` text;
