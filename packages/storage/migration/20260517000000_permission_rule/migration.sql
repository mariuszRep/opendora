CREATE TABLE `permission_rule` (
  `id` text PRIMARY KEY NOT NULL,
  `scope` text NOT NULL,
  `scope_id` text NOT NULL,
  `resource` text NOT NULL,
  `access` text NOT NULL,
  `pattern` text NOT NULL,
  `action` text NOT NULL,
  `time_created` integer NOT NULL,
  `time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `permission_rule_scope_idx` ON `permission_rule` (`scope`, `scope_id`);
