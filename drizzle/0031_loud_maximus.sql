CREATE TABLE `purchase_order_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`store_id` text NOT NULL,
	`entry_type` text DEFAULT 'PAYMENT' NOT NULL,
	`amount_base` integer NOT NULL,
	`paid_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`reference` text,
	`note` text,
	`reversed_payment_id` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reversed_payment_id`) REFERENCES `purchase_order_payments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `po_payments_po_id_idx` ON `purchase_order_payments` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `po_payments_store_paid_at_idx` ON `purchase_order_payments` (`store_id`,`paid_at`);--> statement-breakpoint
CREATE INDEX `po_payments_reversed_id_idx` ON `purchase_order_payments` (`reversed_payment_id`);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `due_date` text;--> statement-breakpoint
CREATE INDEX `po_due_date_idx` ON `purchase_orders` (`store_id`,`due_date`);