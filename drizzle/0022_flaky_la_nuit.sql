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
ALTER TABLE `products` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `category_id` text REFERENCES product_categories(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);
