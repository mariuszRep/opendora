-- Create schedule table for delegation scheduling
CREATE TABLE `schedule` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text,
  `session_id` text,
  `agent_id` text,
  `prompt` text NOT NULL,
  `cron_expression` text NOT NULL,
  `timezone` text,
  `is_active` integer DEFAULT true,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL,
  `last_executed` integer
);
