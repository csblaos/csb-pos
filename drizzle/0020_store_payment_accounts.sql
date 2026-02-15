ALTER TABLE `system_config`
ADD `payment_max_accounts_per_store` integer NOT NULL DEFAULT 5;--> statement-breakpoint
UPDATE `system_config`
SET `payment_max_accounts_per_store` = 5
WHERE `payment_max_accounts_per_store` IS NULL
   OR `payment_max_accounts_per_store` < 1;--> statement-breakpoint
CREATE TABLE `store_payment_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`display_name` text NOT NULL,
	`account_type` text NOT NULL,
	`bank_name` text,
	`account_name` text NOT NULL,
	`account_number` text,
	`promptpay_id` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `store_payment_accounts_store_id_idx`
ON `store_payment_accounts` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_payment_accounts_store_active_idx`
ON `store_payment_accounts` (`store_id`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `store_payment_accounts_store_default_unique`
ON `store_payment_accounts` (`store_id`)
WHERE `is_default` = 1 AND `is_active` = 1;
