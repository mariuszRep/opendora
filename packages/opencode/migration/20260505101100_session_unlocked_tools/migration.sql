-- Add unlocked_tools column to session table.
-- Stores the per-session set of tools unlocked via skill_load (skill.json's
-- tools array) so the allowlist survives server restarts. Without this, the
-- model is forced to re-invoke skill_load on every fresh process. Stored as
-- a JSON array of tool IDs; NULL means "no skill-unlocked tools yet".
ALTER TABLE session ADD COLUMN unlocked_tools TEXT;
