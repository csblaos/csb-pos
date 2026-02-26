CREATE TABLE `product_model_attribute_values` (
	`id` text PRIMARY KEY NOT NULL,
	`attribute_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`attribute_id`) REFERENCES `product_model_attributes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_model_attribute_values_attribute_id_idx` ON `product_model_attribute_values` (`attribute_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_model_attribute_values_attribute_code_unique` ON `product_model_attribute_values` (`attribute_id`,`code`);--> statement-breakpoint
CREATE TABLE `product_model_attributes` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `product_models`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_model_attributes_model_id_idx` ON `product_model_attributes` (`model_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_model_attributes_model_code_unique` ON `product_model_attributes` (`model_id`,`code`);--> statement-breakpoint
CREATE TABLE `product_models` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`category_id` text,
	`image_url` text,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `product_models_store_id_idx` ON `product_models` (`store_id`);--> statement-breakpoint
CREATE INDEX `product_models_created_at_idx` ON `product_models` (`created_at`);--> statement-breakpoint
CREATE INDEX `product_models_category_id_idx` ON `product_models` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_models_store_name_unique` ON `product_models` (`store_id`,`name`);--> statement-breakpoint
ALTER TABLE `products` ADD `model_id` text REFERENCES product_models(id);--> statement-breakpoint
ALTER TABLE `products` ADD `variant_label` text;--> statement-breakpoint
ALTER TABLE `products` ADD `variant_options_json` text;--> statement-breakpoint
ALTER TABLE `products` ADD `variant_sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `products_model_id_idx` ON `products` (`model_id`);--> statement-breakpoint
CREATE INDEX `products_store_barcode_idx` ON `products` (`store_id`,`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_model_variant_options_unique` ON `products` (`model_id`,`variant_options_json`) WHERE "products"."model_id" is not null and "products"."variant_options_json" is not null;