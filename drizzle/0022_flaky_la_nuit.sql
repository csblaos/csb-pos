CREATE TABLE `product_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_categories_store_id_idx` ON `product_categories` (`store_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_categories_store_name_unique` ON `product_categories` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `store_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`address` text,
	`source_branch_id` text,
	`sharing_mode` text,
	`sharing_config` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_branch_id`) REFERENCES `store_branches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `store_branches_store_id_idx` ON `store_branches` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_branches_source_branch_id_idx` ON `store_branches` (`source_branch_id`);--> statement-breakpoint
CREATE INDEX `store_branches_store_created_at_idx` ON `store_branches` (`store_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `store_branches_store_name_unique` ON `store_branches` (`store_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `store_branches_store_code_unique` ON `store_branches` (`store_id`,`code`);--> statement-breakpoint
CREATE TABLE `store_member_branches` (
	`store_id` text NOT NULL,
	`user_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`store_id`, `user_id`, `branch_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`branch_id`) REFERENCES `store_branches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `store_member_branches_store_user_idx` ON `store_member_branches` (`store_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `store_member_branches_branch_idx` ON `store_member_branches` (`branch_id`);--> statement-breakpoint
CREATE TABLE `store_payment_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`display_name` text NOT NULL,
	`account_type` text NOT NULL,
	`bank_name` text,
	`account_name` text NOT NULL,
	`account_number` text,
	`qr_image_url` text,
	`promptpay_id` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `store_payment_accounts_store_id_idx` ON `store_payment_accounts` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_payment_accounts_store_active_idx` ON `store_payment_accounts` (`store_id`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `store_payment_accounts_store_default_unique` ON `store_payment_accounts` (`store_id`) WHERE "store_payment_accounts"."is_default" = 1 and "store_payment_accounts"."is_active" = 1;--> statement-breakpoint
CREATE TABLE `store_type_templates` (
	`store_type` text PRIMARY KEY NOT NULL,
	`app_layout` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `store_type_templates_app_layout_idx` ON `store_type_templates` (`app_layout`);--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`default_can_create_branches` integer DEFAULT true NOT NULL,
	`default_max_branches_per_store` integer DEFAULT 1,
	`default_session_limit` integer DEFAULT 1 NOT NULL,
	`payment_max_accounts_per_store` integer DEFAULT 5 NOT NULL,
	`payment_require_slip_for_lao_qr` integer DEFAULT true NOT NULL,
	`store_logo_max_size_mb` integer DEFAULT 5 NOT NULL,
	`store_logo_auto_resize` integer DEFAULT true NOT NULL,
	`store_logo_resize_max_width` integer DEFAULT 1280 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
DROP INDEX `units_code_unique`;--> statement-breakpoint
ALTER TABLE `units` ADD `scope` text DEFAULT 'SYSTEM' NOT NULL;--> statement-breakpoint
ALTER TABLE `units` ADD `store_id` text REFERENCES stores(id);--> statement-breakpoint
CREATE INDEX `units_store_id_idx` ON `units` (`store_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `units_system_code_unique` ON `units` (`code`) WHERE "units"."scope" = 'SYSTEM';--> statement-breakpoint
CREATE UNIQUE INDEX `units_store_code_unique` ON `units` (`store_id`,`code`) WHERE "units"."scope" = 'STORE';--> statement-breakpoint
DROP INDEX "contacts_store_id_idx";--> statement-breakpoint
DROP INDEX "contacts_created_at_idx";--> statement-breakpoint
DROP INDEX "fb_connections_store_id_idx";--> statement-breakpoint
DROP INDEX "inventory_movements_store_id_idx";--> statement-breakpoint
DROP INDEX "inventory_movements_product_id_idx";--> statement-breakpoint
DROP INDEX "inventory_movements_created_at_idx";--> statement-breakpoint
DROP INDEX "order_items_order_id_idx";--> statement-breakpoint
DROP INDEX "order_items_product_id_idx";--> statement-breakpoint
DROP INDEX "orders_store_id_idx";--> statement-breakpoint
DROP INDEX "orders_order_no_idx";--> statement-breakpoint
DROP INDEX "orders_created_at_idx";--> statement-breakpoint
DROP INDEX "orders_store_created_at_idx";--> statement-breakpoint
DROP INDEX "orders_store_status_created_at_idx";--> statement-breakpoint
DROP INDEX "orders_store_status_paid_at_idx";--> statement-breakpoint
DROP INDEX "orders_store_payment_method_idx";--> statement-breakpoint
DROP INDEX "orders_store_status_channel_idx";--> statement-breakpoint
DROP INDEX "orders_store_order_no_unique";--> statement-breakpoint
DROP INDEX "permissions_key_unique";--> statement-breakpoint
DROP INDEX "permissions_resource_action_unique";--> statement-breakpoint
DROP INDEX "product_categories_store_id_idx";--> statement-breakpoint
DROP INDEX "product_categories_store_name_unique";--> statement-breakpoint
DROP INDEX "product_units_product_id_idx";--> statement-breakpoint
DROP INDEX "product_units_unique";--> statement-breakpoint
DROP INDEX "products_store_id_idx";--> statement-breakpoint
DROP INDEX "products_created_at_idx";--> statement-breakpoint
DROP INDEX "products_category_id_idx";--> statement-breakpoint
DROP INDEX "products_store_sku_unique";--> statement-breakpoint
DROP INDEX "role_permissions_role_id_idx";--> statement-breakpoint
DROP INDEX "roles_store_id_idx";--> statement-breakpoint
DROP INDEX "roles_created_at_idx";--> statement-breakpoint
DROP INDEX "roles_store_name_unique";--> statement-breakpoint
DROP INDEX "store_branches_store_id_idx";--> statement-breakpoint
DROP INDEX "store_branches_source_branch_id_idx";--> statement-breakpoint
DROP INDEX "store_branches_store_created_at_idx";--> statement-breakpoint
DROP INDEX "store_branches_store_name_unique";--> statement-breakpoint
DROP INDEX "store_branches_store_code_unique";--> statement-breakpoint
DROP INDEX "store_member_branches_store_user_idx";--> statement-breakpoint
DROP INDEX "store_member_branches_branch_idx";--> statement-breakpoint
DROP INDEX "store_members_store_id_idx";--> statement-breakpoint
DROP INDEX "store_members_role_id_idx";--> statement-breakpoint
DROP INDEX "store_members_added_by_idx";--> statement-breakpoint
DROP INDEX "store_members_created_at_idx";--> statement-breakpoint
DROP INDEX "store_payment_accounts_store_id_idx";--> statement-breakpoint
DROP INDEX "store_payment_accounts_store_active_idx";--> statement-breakpoint
DROP INDEX "store_payment_accounts_store_default_unique";--> statement-breakpoint
DROP INDEX "store_type_templates_app_layout_idx";--> statement-breakpoint
DROP INDEX "stores_created_at_idx";--> statement-breakpoint
DROP INDEX "units_store_id_idx";--> statement-breakpoint
DROP INDEX "units_system_code_unique";--> statement-breakpoint
DROP INDEX "units_store_code_unique";--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
DROP INDEX "users_created_by_idx";--> statement-breakpoint
DROP INDEX "users_must_change_password_idx";--> statement-breakpoint
DROP INDEX "users_created_at_idx";--> statement-breakpoint
DROP INDEX "wa_connections_store_id_idx";--> statement-breakpoint
ALTER TABLE `products` ALTER COLUMN "cost_base" TO "cost_base" integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE INDEX `contacts_store_id_idx` ON `contacts` (`store_id`);--> statement-breakpoint
CREATE INDEX `contacts_created_at_idx` ON `contacts` (`created_at`);--> statement-breakpoint
CREATE INDEX `fb_connections_store_id_idx` ON `fb_connections` (`store_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_store_id_idx` ON `inventory_movements` (`store_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_product_id_idx` ON `inventory_movements` (`product_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_created_at_idx` ON `inventory_movements` (`created_at`);--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_id_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `orders_store_id_idx` ON `orders` (`store_id`);--> statement-breakpoint
CREATE INDEX `orders_order_no_idx` ON `orders` (`order_no`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_created_at_idx` ON `orders` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_status_created_at_idx` ON `orders` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_status_paid_at_idx` ON `orders` (`store_id`,`status`,`paid_at`);--> statement-breakpoint
CREATE INDEX `orders_store_payment_method_idx` ON `orders` (`store_id`,`payment_method`);--> statement-breakpoint
CREATE INDEX `orders_store_status_channel_idx` ON `orders` (`store_id`,`status`,`channel`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_store_order_no_unique` ON `orders` (`store_id`,`order_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_key_unique` ON `permissions` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_resource_action_unique` ON `permissions` (`resource`,`action`);--> statement-breakpoint
CREATE INDEX `product_units_product_id_idx` ON `product_units` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_units_unique` ON `product_units` (`product_id`,`unit_id`);--> statement-breakpoint
CREATE INDEX `products_store_id_idx` ON `products` (`store_id`);--> statement-breakpoint
CREATE INDEX `products_created_at_idx` ON `products` (`created_at`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_store_sku_unique` ON `products` (`store_id`,`sku`);--> statement-breakpoint
CREATE INDEX `role_permissions_role_id_idx` ON `role_permissions` (`role_id`);--> statement-breakpoint
CREATE INDEX `roles_store_id_idx` ON `roles` (`store_id`);--> statement-breakpoint
CREATE INDEX `roles_created_at_idx` ON `roles` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `roles_store_name_unique` ON `roles` (`store_id`,`name`);--> statement-breakpoint
CREATE INDEX `store_members_store_id_idx` ON `store_members` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_members_role_id_idx` ON `store_members` (`role_id`);--> statement-breakpoint
CREATE INDEX `store_members_added_by_idx` ON `store_members` (`added_by`);--> statement-breakpoint
CREATE INDEX `store_members_created_at_idx` ON `store_members` (`created_at`);--> statement-breakpoint
CREATE INDEX `stores_created_at_idx` ON `stores` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_created_by_idx` ON `users` (`created_by`);--> statement-breakpoint
CREATE INDEX `users_must_change_password_idx` ON `users` (`must_change_password`);--> statement-breakpoint
CREATE INDEX `users_created_at_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE INDEX `wa_connections_store_id_idx` ON `wa_connections` (`store_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `category_id` text REFERENCES product_categories(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_currency` text DEFAULT 'LAK' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_method` text DEFAULT 'CASH' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_account_id` text REFERENCES store_payment_accounts(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_slip_url` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_proof_submitted_at` text;--> statement-breakpoint
ALTER TABLE `store_members` ADD `added_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `stores` ADD `logo_name` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `address` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `phone_number` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `supported_currencies` text DEFAULT '["LAK"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `vat_mode` text DEFAULT 'EXCLUSIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `max_branches_override` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_updated_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `can_create_branches` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `max_branches_per_store` integer;