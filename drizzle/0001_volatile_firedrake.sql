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
DROP INDEX "orders_store_order_no_unique";--> statement-breakpoint
DROP INDEX "permissions_key_unique";--> statement-breakpoint
DROP INDEX "permissions_resource_action_unique";--> statement-breakpoint
DROP INDEX "product_units_product_id_idx";--> statement-breakpoint
DROP INDEX "product_units_unique";--> statement-breakpoint
DROP INDEX "products_store_id_idx";--> statement-breakpoint
DROP INDEX "products_created_at_idx";--> statement-breakpoint
DROP INDEX "products_store_sku_unique";--> statement-breakpoint
DROP INDEX "role_permissions_role_id_idx";--> statement-breakpoint
DROP INDEX "roles_store_id_idx";--> statement-breakpoint
DROP INDEX "roles_created_at_idx";--> statement-breakpoint
DROP INDEX "roles_store_name_unique";--> statement-breakpoint
DROP INDEX "store_members_store_id_idx";--> statement-breakpoint
DROP INDEX "store_members_role_id_idx";--> statement-breakpoint
DROP INDEX "store_members_created_at_idx";--> statement-breakpoint
DROP INDEX "stores_created_at_idx";--> statement-breakpoint
DROP INDEX "units_code_unique";--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
DROP INDEX "users_created_at_idx";--> statement-breakpoint
DROP INDEX "wa_connections_store_id_idx";--> statement-breakpoint
ALTER TABLE `stores` ALTER COLUMN "store_type" TO "store_type" text NOT NULL DEFAULT 'ONLINE_RETAIL';--> statement-breakpoint
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
CREATE UNIQUE INDEX `orders_store_order_no_unique` ON `orders` (`store_id`,`order_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_key_unique` ON `permissions` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_resource_action_unique` ON `permissions` (`resource`,`action`);--> statement-breakpoint
CREATE INDEX `product_units_product_id_idx` ON `product_units` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_units_unique` ON `product_units` (`product_id`,`unit_id`);--> statement-breakpoint
CREATE INDEX `products_store_id_idx` ON `products` (`store_id`);--> statement-breakpoint
CREATE INDEX `products_created_at_idx` ON `products` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_store_sku_unique` ON `products` (`store_id`,`sku`);--> statement-breakpoint
CREATE INDEX `role_permissions_role_id_idx` ON `role_permissions` (`role_id`);--> statement-breakpoint
CREATE INDEX `roles_store_id_idx` ON `roles` (`store_id`);--> statement-breakpoint
CREATE INDEX `roles_created_at_idx` ON `roles` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `roles_store_name_unique` ON `roles` (`store_id`,`name`);--> statement-breakpoint
CREATE INDEX `store_members_store_id_idx` ON `store_members` (`store_id`);--> statement-breakpoint
CREATE INDEX `store_members_role_id_idx` ON `store_members` (`role_id`);--> statement-breakpoint
CREATE INDEX `store_members_created_at_idx` ON `store_members` (`created_at`);--> statement-breakpoint
CREATE INDEX `stores_created_at_idx` ON `stores` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `units_code_unique` ON `units` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_created_at_idx` ON `users` (`created_at`);--> statement-breakpoint
CREATE INDEX `wa_connections_store_id_idx` ON `wa_connections` (`store_id`);