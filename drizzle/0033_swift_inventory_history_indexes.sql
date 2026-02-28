CREATE INDEX IF NOT EXISTS `inventory_movements_store_created_at_idx`
ON `inventory_movements` (`store_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `inventory_movements_store_type_created_at_idx`
ON `inventory_movements` (`store_id`,`type`,`created_at`,`id`);
