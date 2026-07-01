CREATE TABLE IF NOT EXISTS `workflow_run_checkpoint` (
  `run_id`        text NOT NULL REFERENCES `session`(`id`) ON DELETE CASCADE,
  `checkpoint_id` text NOT NULL,
  `workflow_id`   text NOT NULL,
  `status`        text NOT NULL DEFAULT 'running',
  `cursor`        text,
  `ctx`           text NOT NULL DEFAULT '{}',
  `step_journal`  text NOT NULL DEFAULT '[]',
  `error`         text,
  `created_at`    integer NOT NULL,
  PRIMARY KEY (`run_id`, `checkpoint_id`)
);
CREATE INDEX IF NOT EXISTS `idx_wrc_run_status` ON `workflow_run_checkpoint`(`run_id`, `status`);
