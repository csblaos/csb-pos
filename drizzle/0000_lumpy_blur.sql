CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`channel` text NOT NULL,
	`display_name` text NOT NULL,
	`phone` text,
	`last_inbound_at` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contacts_store_id_idx` ON `contacts` (`store_id`);--> statement-breakpoint
CREATE INDEX `contacts_created_at_idx` ON `contacts` (`created_at`);--> statement-breakpoint
CREATE TABLE `fb_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`status` text DEFAULT 'DISCONNECTED' NOT NULL,
	`page_name` text,
	`page_id` text,
	`connected_at` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fb_connections_store_id_idx` ON `fb_connections` (`store_id`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`qty_base` integer NOT NULL,
	`ref_type` text NOT NULL,
	`ref_id` text,
	`note` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_movements_store_id_idx` ON `inventory_movements` (`store_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_product_id_idx` ON `inventory_movements` (`product_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_created_at_idx` ON `inventory_movements` (`created_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`qty` integer NOT NULL,
	`qty_base` integer NOT NULL,
	`price_base_at_sale` integer NOT NULL,
	`cost_base_at_sale` integer NOT NULL,
	`line_total` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_id_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_no` text NOT NULL,
	`channel` text DEFAULT 'WALK_IN' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`contact_id` text,
	`customer_name` text,
	`customer_phone` text,
	`customer_address` text,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`vat_amount` integer DEFAULT 0 NOT NULL,
	`shipping_fee_charged` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`shipping_cost` integer DEFAULT 0 NOT NULL,
	`paid_at` text,
	`shipped_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_store_id_idx` ON `orders` (`store_id`);--> statement-breakpoint
CREATE INDEX `orders_order_no_idx` ON `orders` (`order_no`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_store_order_no_unique` ON `orders` (`store_id`,`order_no`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`resource` text NOT NULL,
	`action` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_key_unique` ON `permissions` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_resource_action_unique` ON `permissions` (`resource`,`action`);--> statement-breakpoint
CREATE TABLE `product_units` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`multiplier_to_base` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `product_units_product_id_idx` ON `product_units` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_units_unique` ON `product_units` (`product_id`,`unit_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`barcode` text,
	`base_unit_id` text NOT NULL,
	`price_base` integer NOT NULL,
	`cost_base` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `products_store_id_idx` ON `products` (`store_id`);--> statement-breakpoint
CREATE INDEX `products_created_at_idx` ON `products` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_store_sku_unique` ON `products` (`store_id`,`sku`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	PRIMARY KEY(`role_id`, `permission_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_permissions_role_id_idx` ON `role_permissions` (`role_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `roles_store_id_idx` ON `roles` (`store_id`);--> statement-breakpoint
CREATE INDEX `roles_created_at_idx` ON `roles` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `roles_store_name_unique` ON `roles` (`store_id`,`name`);--> statement-breakpoint
CREATE TABLE `store_members` (
	`store_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`store_id`, `user_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `store_members_store_id_idx` ON `store_members` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_members_role_id_idx` ON `store_members` (`role_id`);--> statement-breakpoint
CREATE INDEX `store_members_created_at_idx` ON `store_members` (`created_at`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`store_type` text DEFAULT 'RETAIL' NOT NULL,
	`currency` text DEFAULT 'LAK' NOT NULL,
	`vat_enabled` integer DEFAULT false NOT NULL,
	`vat_rate` integer DEFAULT 700 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stores_created_at_idx` ON `stores` (`created_at`);--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name_th` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `units_code_unique` ON `units` (`code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_created_at_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE TABLE `wa_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`status` text DEFAULT 'DISCONNECTED' NOT NULL,
	`phone_number` text,
	`connected_at` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wa_connections_store_id_idx` ON `wa_connections` (`store_id`);