CREATE TABLE `project_directory` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `project`(`id`) ON DELETE CASCADE,
  `path` text NOT NULL,
  `label` text,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_directory_project_idx` ON `project_directory` (`project_id`);
