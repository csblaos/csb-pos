CREATE TABLE `order_shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`store_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`tracking_no` text,
	`label_url` text,
	`label_file_key` text,
	`provider_request_id` text,
	`provider_response` text,
	`last_error` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_shipments_order_id_idx` ON `order_shipments` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_shipments_store_status_created_at_idx` ON `order_shipments` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_shipments_provider_request_id_idx` ON `order_shipments` (`provider_request_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_status` text DEFAULT 'UNPAID' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_provider` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_label_status` text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_label_url` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_label_file_key` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_request_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `cod_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `cod_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `cod_settled_at` text;--> statement-breakpoint
CREATE INDEX `orders_store_payment_status_created_at_idx` ON `orders` (`store_id`,`payment_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_shipping_label_status_updated_idx` ON `orders` (`store_id`,`shipping_label_status`,`created_at`);--> statement-breakpoint
