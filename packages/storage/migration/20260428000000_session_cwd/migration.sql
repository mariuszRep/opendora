-- Add cwd (working directory) column to session table
-- Empty/NULL means use the project root; non-null overrides the tool execution cwd.
ALTER TABLE session ADD COLUMN cwd TEXT;
