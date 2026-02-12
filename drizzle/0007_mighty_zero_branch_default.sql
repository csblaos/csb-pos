INSERT INTO `system_config` (
	`id`,
	`default_can_create_branches`,
	`default_max_branches_per_store`
) VALUES (
	'global',
	1,
	0
) ON CONFLICT (`id`) DO NOTHING;--> statement-breakpoint
UPDATE `system_config`
SET
	`default_max_branches_per_store` = 0,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'global';
