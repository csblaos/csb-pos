ALTER TABLE `orders` ADD `shipping_carrier` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `tracking_no` text;--> statement-breakpoint
CREATE INDEX `orders_store_created_at_idx` ON `orders` (`store_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_status_created_at_idx` ON `orders` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_store_status_paid_at_idx` ON `orders` (`store_id`,`status`,`paid_at`);