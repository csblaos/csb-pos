CREATE TABLE `purchase_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`qty_ordered` integer NOT NULL,
	`qty_received` integer DEFAULT 0 NOT NULL,
	`unit_cost_purchase` integer DEFAULT 0 NOT NULL,
	`unit_cost_base` integer DEFAULT 0 NOT NULL,
	`landed_cost_per_unit` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `po_items_po_id_idx` ON `purchase_order_items` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `po_items_product_id_idx` ON `purchase_order_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`po_number` text NOT NULL,
	`supplier_name` text,
	`supplier_contact` text,
	`purchase_currency` text DEFAULT 'LAK' NOT NULL,
	`exchange_rate` integer DEFAULT 1 NOT NULL,
	`shipping_cost` integer DEFAULT 0 NOT NULL,
	`other_cost` integer DEFAULT 0 NOT NULL,
	`other_cost_note` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`ordered_at` text,
	`expected_at` text,
	`shipped_at` text,
	`received_at` text,
	`tracking_info` text,
	`note` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `po_store_id_idx` ON `purchase_orders` (`store_id`);--> statement-breakpoint
CREATE INDEX `po_status_idx` ON `purchase_orders` (`store_id`,`status`);--> statement-breakpoint
CREATE INDEX `po_created_at_idx` ON `purchase_orders` (`store_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `po_store_po_number_unique` ON `purchase_orders` (`store_id`,`po_number`);