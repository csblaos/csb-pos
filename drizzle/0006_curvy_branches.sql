ALTER TABLE `users` ADD `can_create_branches` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `max_branches_per_store` integer;--> statement-breakpoint
ALTER TABLE `stores` ADD `max_branches_override` integer;--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`default_can_create_branches` integer DEFAULT true NOT NULL,
	`default_max_branches_per_store` integer DEFAULT 5,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);--> statement-breakpoint
INSERT INTO `system_config` (
	`id`,
	`default_can_create_branches`,
	`default_max_branches_per_store`
) VALUES (
	'global',
	1,
	5
) ON CONFLICT (`id`) DO NOTHING;--> statement-breakpoint
CREATE TABLE `store_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`address` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `store_branches_store_id_idx` ON `store_branches` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_branches_store_created_at_idx` ON `store_branches` (`store_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `store_branches_store_name_unique` ON `store_branches` (`store_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `store_branches_store_code_unique` ON `store_branches` (`store_id`,`code`);
