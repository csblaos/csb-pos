CREATE TABLE `shipping_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`code` text NOT NULL,
	`display_name` text NOT NULL,
	`branch_name` text,
	`aliases` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shipping_providers_store_id_idx` ON `shipping_providers` (`store_id`);--> statement-breakpoint
CREATE INDEX `shipping_providers_store_active_sort_idx` ON `shipping_providers` (`store_id`,`active`,`sort_order`,`display_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `shipping_providers_store_code_unique` ON `shipping_providers` (`store_id`,`code`);
--> statement-breakpoint
INSERT OR IGNORE INTO `shipping_providers` (
	`id`,
	`store_id`,
	`code`,
	`display_name`,
	`branch_name`,
	`aliases`,
	`active`,
	`sort_order`,
	`created_at`
)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
	`stores`.`id`,
	'HOUNGALOUN',
	'Houngaloun',
	NULL,
	'[]',
	1,
	10,
	CURRENT_TIMESTAMP
FROM `stores`;--> statement-breakpoint
INSERT OR IGNORE INTO `shipping_providers` (
	`id`,
	`store_id`,
	`code`,
	`display_name`,
	`branch_name`,
	`aliases`,
	`active`,
	`sort_order`,
	`created_at`
)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
	`stores`.`id`,
	'ANOUSITH',
	'Anousith',
	NULL,
	'[]',
	1,
	20,
	CURRENT_TIMESTAMP
FROM `stores`;--> statement-breakpoint
INSERT OR IGNORE INTO `shipping_providers` (
	`id`,
	`store_id`,
	`code`,
	`display_name`,
	`branch_name`,
	`aliases`,
	`active`,
	`sort_order`,
	`created_at`
)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
	`stores`.`id`,
	'MIXAY',
	'Mixay',
	NULL,
	'[]',
	1,
	30,
	CURRENT_TIMESTAMP
FROM `stores`;
