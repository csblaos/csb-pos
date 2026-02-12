ALTER TABLE `system_config` ADD `default_session_limit` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE `system_config`
SET
	`default_session_limit` = 1,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'global';
