-- Add path and read_path columns to session table
-- path: write boundary (hard enforced)
-- read_path: soft boundary (triggers approval outside this)
ALTER TABLE session ADD COLUMN path TEXT;
ALTER TABLE session ADD COLUMN read_path TEXT;

-- Note: We do NOT drop filesystem_config, tool_policy, or default_path columns
-- to avoid breaking existing deployments. They will be ignored by the new code.
-- A future cleanup migration can remove them once all instances are migrated.
